// Deterministic CPU event model. A worker owns real bytes until explicit drain.
// No sleeps, DMA, GPU, registration or runtime integration is simulated as real hardware.
#include <algorithm>
#include <array>
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
constexpr std::size_t payload_size = 64 * 1024;
constexpr std::uint64_t logical_size = 64ULL * 1024 * 1024;
enum class State { FREE, IN_FLIGHT, QUARANTINED, READY, PUBLISHED, CONSUMING, DRAINED };
const char* name(State s) {
    switch (s) {
    case State::FREE: return "FREE";
    case State::IN_FLIGHT: return "IN_FLIGHT";
    case State::QUARANTINED: return "QUARANTINED";
    case State::READY: return "READY";
    case State::PUBLISHED: return "PUBLISHED";
    case State::CONSUMING: return "CONSUMING";
    case State::DRAINED: return "DRAINED";
    }
    return "INVALID";
}
struct Allocation {
    std::vector<std::uint8_t> bytes = std::vector<std::uint8_t>(payload_size);
    std::uint64_t id = 0, generation = 0;
    State state = State::FREE;
    bool published = false;
    int inflight = 0, leases = 0, reservations = 0;
};
struct Attempt {
    int request_id, attempt_id;
    std::shared_ptr<Allocation> target; // worker owns target even after logical timeout
    std::uint64_t generation;
    std::uint8_t value;
    std::size_t written = 0;
    bool timeout = false, notified = false, drained = false, consumer = false, consumer_failed = false;
    bool published = false;
    int publish_count = 0, release_count = 0;
};

class Simulation {
    std::array<std::shared_ptr<Allocation>, 2> pool{
        std::make_shared<Allocation>(), std::make_shared<Allocation>()};
    std::vector<std::shared_ptr<Attempt>> tickets;
    std::unordered_map<int, std::shared_ptr<Attempt>> active;
    std::unordered_map<int, std::uint64_t> published;
    std::uint64_t next_id = 100, time = 0;
    int peak = 0;
    std::string scenario;
    using Ticket = std::shared_ptr<Attempt>;
    void trace(const Ticket& t, const char* event) {
        const auto& a = *t->target;
        std::cout << "t" << time++ << " scenario=" << scenario << " request=" << t->request_id
                  << " attempt=" << t->attempt_id << " allocation=" << a.id << " generation=" << a.generation
                  << " event=" << event << " state=" << name(a.state) << " published=" << a.published
                  << " logical_written=" << t->written * (logical_size / payload_size)
                  << " payload_written=" << t->written << " inflight=" << a.inflight
                  << " leases=" << a.leases << " reservations=" << a.reservations << '\n';
    }
    bool available(const Ticket& t) const { return t->target->state == State::FREE; }
    Ticket submit(int request, int attempt, std::uint8_t value) {
        for (auto& a : pool) if (a->state == State::FREE) {
            require(a->inflight == 0 && a->leases == 0 && a->reservations == 0, "unsafe reuse");
            a->id = next_id++;
            ++a->generation;
            a->state = State::IN_FLIGHT;
            a->published = false;
            a->inflight = a->leases = a->reservations = 1;
            std::fill(a->bytes.begin(), a->bytes.end(), 0);
            auto t = std::make_shared<Attempt>(Attempt{request, attempt, a, a->generation, value});
            tickets.push_back(t);
            active[request] = t;
            int busy = 0;
            for (const auto& slot : pool) busy += slot->state != State::FREE;
            peak = std::max(peak, busy);
            trace(t, "SUBMIT");
            return t;
        }
        return {}; // bounded backpressure, never allocate a third payload
    }
    Ticket duplicate_request(int request) {
        auto t = active.at(request);
        trace(t, "DUPLICATE_REQUEST_SINGLE_FLIGHT");
        return t;
    }
    void write(const Ticket& t, std::size_t n) {
        auto& a = *t->target;
        require(!t->drained && !t->notified && a.inflight == 1 && a.generation == t->generation,
                "worker write after physical completion/reuse");
        require(n <= payload_size, "out of range write");
        // Intentionally do NOT reject timed-out generation: the old physical writer still runs.
        std::fill_n(a.bytes.begin(), n, t->value);
        t->written = n;
        trace(t, t->timeout ? "LATE_WRITE" : "WRITE");
    }
    bool publish(const Ticket& t) {
        auto& a = *t->target;
        if (t->timeout || !t->notified || t->written != payload_size || a.state != State::READY ||
            published.count(t->request_id)) {
            trace(t, "PUBLISH_REJECTED");
            return false;
        }
        require(std::all_of(a.bytes.begin(), a.bytes.end(), [&](auto v) { return v == t->value; }),
                "publish without content proof");
        a.state = State::PUBLISHED;
        a.published = t->published = true;
        ++t->publish_count;
        published[t->request_id] = a.id; // conditional publish, once per request
        // consumer lease acquired atomically with publish, not after an unprotected gap
        ++a.leases;
        t->consumer = true;
        trace(t, "PUBLISH");
        return true;
    }
    void timeout(const Ticket& t) {
        require(!t->notified && t->target->inflight == 1, "timeout not in flight");
        t->timeout = true;
        trace(t, "CALLER_TIMEOUT");
        t->target->state = State::QUARANTINED;
        trace(t, "QUARANTINE");
        require(!available(t) && t->target->leases == 1, "timeout freed physical target");
    }
    void completion(const Ticket& t, bool success) {
        if (t->notified) { trace(t, "DUPLICATE_COMPLETION_IGNORED"); return; }
        require(!t->drained && t->target->inflight == 1, "unexpected completion");
        t->notified = true;
        --t->target->inflight; // exactly once; notification alone does NOT release worker lease
        if (success && !t->timeout && t->written == payload_size) t->target->state = State::READY;
        else t->target->state = State::QUARANTINED;
        trace(t, t->timeout ? "LATE_COMPLETION" : (success ? "COMPLETION" : "PARTIAL_FAILURE"));
    }
    void release(const Ticket& t) {
        auto& a = *t->target;
        if (!t->drained || t->consumer) return;
        require(a.inflight == 0 && a.leases == 0 && a.reservations == 1, "release with live resources");
        require(t->release_count == 0, "double free");
        if (t->published) published.erase(t->request_id);
        a.reservations = 0;
        a.published = false;
        a.state = State::FREE;
        ++t->release_count;
        trace(t, "RELEASE");
    }
    void drain(const Ticket& t) {
        if (t->drained) { trace(t, "DUPLICATE_DRAIN_IGNORED"); return; }
        require(t->notified && t->target->inflight == 0, "drain before physical completion");
        t->drained = true;
        --t->target->leases;
        if (!t->consumer) t->target->state = State::DRAINED;
        trace(t, "DRAIN");
        release(t);
    }
    void consume_start(const Ticket& t) {
        require(t->consumer && t->published, "consumer without proof/lease");
        t->target->state = State::CONSUMING;
        trace(t, "CONSUME_START");
    }
    void consumer_failure(const Ticket& t) {
        require(t->consumer, "failure without live consumer");
        t->consumer_failed = true;
        trace(t, "CONSUMER_CANCEL_REQUESTED");
        require(!available(t) && t->target->leases >= 1, "cancellation freed live consumer");
    }
    void consumer_done(const Ticket& t) {
        require(t->consumer && t->target->state == State::CONSUMING, "duplicate consumer release");
        require(std::all_of(t->target->bytes.begin(), t->target->bytes.end(), [&](auto v) { return v == t->value; }),
                "new published bytes polluted by old writer");
        t->consumer = false;
        --t->target->leases;
        t->target->state = State::DRAINED;
        trace(t, t->consumer_failed ? "CONSUMER_STOPPED" : "CONSUMER_DONE");
        release(t);
    }
    void check_closed() {
        int inflight = 0, leases = 0, reservations = 0, quarantined = 0;
        for (const auto& a : pool) {
            inflight += a->inflight; leases += a->leases; reservations += a->reservations;
            quarantined += a->state == State::QUARANTINED;
            require(a->state == State::FREE && !a->published, "non-free allocation at exit");
        }
        for (const auto& t : tickets)
            require(t->release_count == 1 && t->publish_count <= 1 && t->drained, "ticket did not terminate once");
        require(inflight == 0 && leases == 0 && reservations == 0 && quarantined == 0 && published.empty(),
                "resources not closed");
        std::cout << "PASS scenario=" << scenario << " inflight=" << inflight << " leases=" << leases
                  << " reservations=" << reservations << " quarantined=" << quarantined
                  << " peak_allocations=" << peak << " payload_bytes_per_slot=" << payload_size
                  << " logical_bytes_per_slot=" << logical_size << '\n';
    }
public:
    explicit Simulation(std::string s) : scenario(std::move(s)) {}
    void run() {
        // Logical event sequences, not a wall-clock benchmark. Actual bytes are small.
        auto old = submit(42, 1, 11);
        require(bool(old), "initial submit failed");
        if (scenario == "partial") {
            write(old, payload_size / 2); // 32 MiB /64 MiB logical,32 KiB/64 KiB real
            require(!publish(old), "partial data published");
            completion(old, false);
            require(old->target->state != State::READY && !publish(old), "partial failure became READY");
            drain(old);
        } else if (scenario == "duplicate") {
            auto same = duplicate_request(42);
            require(same == old && tickets.size() == 1, "duplicate allocated payload");
            write(old, payload_size);
            completion(old, true);
            require(publish(old), "complete data not published");
            completion(old, true);
            require(!publish(old) && old->publish_count == 1, "duplicate publication");
            drain(old);
            consume_start(old);
            consumer_done(old);
            drain(old);
            completion(old, true);
            require(old->release_count == 1, "duplicate completion double free");
        } else if (scenario == "consumer") {
            write(old, payload_size);
            completion(old, true);
            require(publish(old), "publish failed");
            drain(old);
            consume_start(old);
            consumer_failure(old);
            // cancellation notification != physical consumer stop
            require(old->target->state == State::CONSUMING && old->release_count == 0, "premature recycle");
            consumer_done(old);
        } else {
            write(old, payload_size / 2);
            require(!publish(old), "partial data published");
            timeout(old);
            if (scenario == "timeout") {
                require(!available(old) && old->target->inflight == 1, "timeout stopped physical work");
                write(old, payload_size);
                completion(old, true);
                require(!publish(old), "timed out attempt published");
                drain(old);
            } else { // retry and late scenarios independently replay the full isolation sequence
                auto next = submit(42, 2, 22);
                require(next && next->target != old->target && next->target->id != old->target->id,
                        "retry reused old allocation");
                require(!submit(99, 1, 33), "pool expanded past two allocations");
                trace(next, "POOL_EXHAUSTED_BACKPRESSURE");
                write(next, payload_size);
                completion(next, true);
                require(publish(next), "retry publish failed");
                drain(next); // consumer still owns next
                write(old, payload_size); // real write into old target after new publish
                require(std::all_of(next->target->bytes.begin(), next->target->bytes.end(),
                                    [](auto v) { return v == 22; }), "late write polluted new target");
                trace(next, "NEW_CONTENT_UNCHANGED");
                completion(old, true);
                require(!publish(old) && !available(old), "late target became published/free before drain");
                drain(old);
                if (scenario == "late") {
                    auto reused = submit(99, 1, 33);
                    require(reused && reused->target == old->target && reused->generation == old->generation + 1,
                            "drained slot not safely reusable in next generation");
                    trace(reused, "REUSE_AFTER_DRAIN");
                    write(reused, payload_size);
                    completion(reused, true);
                    require(publish(reused), "reused slot not publishable");
                    drain(reused);
                    consume_start(reused);
                    consumer_done(reused);
                }
                consume_start(next);
                consumer_done(next);
            }
        }
        check_closed();
    }
};
int main(int argc, char** argv) {
    try {
        const std::vector<std::string> cases{"timeout", "retry", "duplicate", "late", "partial", "consumer"};
        require(argc <= 2, "usage: failure_injection_sim [all|timeout|retry|duplicate|late|partial|consumer]");
        std::string selected = argc == 2 ? argv[1] : "all";
        require(selected == "all" || std::find(cases.begin(), cases.end(), selected) != cases.end(), "unknown scenario");
        for (const auto& s : cases) if (selected == "all" || selected == s) Simulation(s).run();
    } catch (const std::exception& e) {
        std::cerr << "FAIL: " << e.what() << '\n';
        return 1;
    }
}
