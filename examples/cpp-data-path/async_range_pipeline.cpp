// CPU/local HTTP only. Fixed owning slots, bounded queue, no per-request payload allocation.
#include <curl/curl.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <condition_variable>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <exception>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using Clock = std::chrono::steady_clock;
void require(bool ok, const char* text) { if (!ok) throw std::runtime_error(text); }
std::uint64_t number(const std::string& s) {
    require(!s.empty() && std::all_of(s.begin(), s.end(), [](unsigned char c) {
        return std::isdigit(c); }), "expected unsigned integer");
    return std::stoull(s);
}
std::uint8_t expected_byte(std::uint64_t offset) {
    std::uint64_t x = offset + 0x9e3779b97f4a7c15ULL;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
    return static_cast<std::uint8_t>(x ^ (x >> 31));
}
enum class State { FREE, FILLING, VERIFIED, CONSUMING };
const char* name(State s) {
    switch (s) {
    case State::FREE: return "FREE";
    case State::FILLING: return "FILLING";
    case State::VERIFIED: return "VERIFIED";
    case State::CONSUMING: return "CONSUMING";
    }
    return "INVALID";
}
struct Slot {
    std::vector<std::uint8_t> bytes;
    State state = State::FREE;
    std::uint64_t generation = 0, offset = 0, attempt = 0;
    std::size_t length = 0, received = 0;
    std::string content_range;
    explicit Slot(std::size_t capacity) : bytes(capacity) {}
};
std::size_t body(char* data, std::size_t size, std::size_t count, void* context) noexcept {
    auto& slot = *static_cast<Slot*>(context);
    if (size && count > std::numeric_limits<std::size_t>::max() / size) return 0;
    const auto n = size * count;
    if (n > slot.length - slot.received) return 0;
    std::copy_n(reinterpret_cast<std::uint8_t*>(data), n, slot.bytes.data() + slot.received);
    slot.received += n;
    return n;
}
std::size_t header(char* data, std::size_t size, std::size_t count, void* context) noexcept {
    if (size && count > std::numeric_limits<std::size_t>::max() / size) return 0;
    const auto n = size * count;
    try {
        auto& slot = *static_cast<Slot*>(context);
        std::string line(data, n);
        if (line.rfind("HTTP/", 0) == 0) slot.content_range.clear();
        auto colon = line.find(':');
        if (colon == std::string::npos) return n;
        auto key = line.substr(0, colon);
        std::transform(key.begin(), key.end(), key.begin(), [](unsigned char c) { return std::tolower(c); });
        if (key == "content-range") {
            auto v = line.substr(colon + 1);
            auto first = v.find_first_not_of(" \t\r\n"), last = v.find_last_not_of(" \t\r\n");
            slot.content_range = first == std::string::npos ? "" : v.substr(first, last - first + 1);
        }
        return n;
    } catch (...) { return 0; }
}
template<class T> void set(CURL* h, CURLoption option, T value) {
    require(curl_easy_setopt(h, option, value) == CURLE_OK, "curl option failed");
}
struct Global {
    Global() { require(curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK, "curl init failed"); }
    ~Global() { curl_global_cleanup(); }
};

class Pipeline {
    std::array<Slot, 2> slots;
    const std::uint64_t total;
    const std::size_t chunk, outstanding;
    const std::string url;
    const bool gate, tracing;
    std::mutex mutex;
    std::condition_variable changed;
    std::deque<std::size_t> ready; // Capacity exactly one, checked before every push.
    std::uint64_t next = 0, submitted = 0, consumed = 0, verified_bytes = 0;
    std::size_t inflight = 0, in_use = 0, peak = 0, peak_inflight = 0, peak_queue = 0;
    std::size_t pool_waits = 0, queue_waits = 0;
    std::uint64_t checksum = 0;
    bool stopped = false, gate_reached = false;
    std::exception_ptr error;
    Clock::time_point begin = Clock::now();

    // Called under mutex. Slot data remains exclusively owned by producer/consumer.
    void trace(const char* event, std::size_t id) {
        if (!tracing) return;
        const auto& s = slots[id];
        std::cout << "t_us=" << std::chrono::duration_cast<std::chrono::microseconds>(Clock::now() - begin).count()
                  << " event=" << event << " slot=" << id << " generation=" << s.generation
                  << " attempt=" << s.attempt << " offset=" << s.offset << " length=" << s.length
                  << " state=" << name(s.state) << " queue_depth=" << ready.size()
                  << " slots_in_use=" << in_use << " inflight=" << inflight
                  << " inflight_bytes=" << inflight_bytes() << '\n';
    }
    std::size_t inflight_bytes() const {
        std::size_t sum = 0;
        for (const auto& s : slots) if (s.state == State::FILLING) sum += s.length;
        return sum;
    }
    void fail() {
        std::lock_guard<std::mutex> lock(mutex);
        if (!error) error = std::current_exception();
        stopped = true;
        changed.notify_all();
    }
    void get(CURL* h, Slot& s) {
        s.received = 0;
        s.content_range.clear();
        auto range = std::to_string(s.offset) + "-" + std::to_string(s.offset + s.length - 1);
        set(h, CURLOPT_RANGE, range.c_str());
        set(h, CURLOPT_WRITEDATA, &s);
        set(h, CURLOPT_HEADERDATA, &s);
        auto code = curl_easy_perform(h);
        long status = 0;
        require(curl_easy_getinfo(h, CURLINFO_RESPONSE_CODE, &status) == CURLE_OK, "HTTP status unavailable");
        require(code == CURLE_OK, "transport/body failure");
        { std::lock_guard<std::mutex> lock(mutex); trace("body_done", static_cast<std::size_t>(&s - slots.data())); }
        require(status == 206, "expected HTTP 206");
        require(s.content_range == "bytes " + range + "/" + std::to_string(total), "Content-Range mismatch");
        require(s.received == s.length, "body length mismatch");
        for (std::size_t i = 0; i < s.length; ++i)
            require(s.bytes[i] == expected_byte(s.offset + i), "producer payload mismatch");
    }
    void producer() {
        try {
            using Handle = std::unique_ptr<CURL, decltype(&curl_easy_cleanup)>;
            Handle h(curl_easy_init(), &curl_easy_cleanup);
            require(bool(h), "curl easy init failed");
            set(h.get(), CURLOPT_URL, url.c_str());
            set(h.get(), CURLOPT_PROTOCOLS_STR, "http");
            set(h.get(), CURLOPT_FOLLOWLOCATION, 0L);
            set(h.get(), CURLOPT_NOPROXY, "*");
            set(h.get(), CURLOPT_CONNECTTIMEOUT_MS, 5000L);
            set(h.get(), CURLOPT_TIMEOUT_MS, 10000L);
            set(h.get(), CURLOPT_NOSIGNAL, 1L);
            set(h.get(), CURLOPT_WRITEFUNCTION, &body);
            set(h.get(), CURLOPT_HEADERFUNCTION, &header);
            while (true) {
                std::size_t id = 0;
                {
                    std::unique_lock<std::mutex> lock(mutex);
                    auto free_slot = [&] { return slots[0].state == State::FREE || slots[1].state == State::FREE; };
                    if (next < total && !free_slot()) {
                        ++pool_waits;
                        gate_reached = true; // deterministic consumer gate: observed pool exhaustion
                        trace("producer_wait_pool", 0);
                        changed.notify_all();
                    }
                    changed.wait(lock, [&] { return stopped || next == total || free_slot(); });
                    if (stopped || next == total) return;
                    id = slots[0].state == State::FREE ? 0 : 1;
                    auto& s = slots[id];
                    require(s.state == State::FREE, "borrow before consumer release");
                    s.state = State::FILLING;
                    ++s.generation;
                    s.attempt = ++submitted;
                    s.offset = next;
                    s.length = static_cast<std::size_t>(std::min<std::uint64_t>(chunk, total - next));
                    next += s.length;
                    ++inflight;
                    ++in_use;
                    peak = std::max(peak, in_use);
                    peak_inflight = std::max(peak_inflight, inflight);
                    require(inflight <= outstanding && in_use <= 2, "bounded concurrency violated");
                    trace("submit", id);
                }
                get(h.get(), slots[id]); // producer alone may write this slot; no mutex needed for bytes
                {
                    std::unique_lock<std::mutex> lock(mutex);
                    auto& s = slots[id];
                    --inflight;
                    s.state = State::VERIFIED;
                    trace("verified", id);
                    if (ready.size() == 1) { ++queue_waits; trace("producer_wait_queue", id); }
                    changed.wait(lock, [&] { return stopped || ready.empty(); });
                    if (stopped) return;
                    ready.push_back(id);
                    peak_queue = std::max(peak_queue, ready.size());
                    trace("enqueue", id);
                    changed.notify_all();
                }
            }
        } catch (...) { fail(); }
    }
    void consumer() {
        try {
            while (true) {
                std::size_t id;
                std::uint64_t generation;
                {
                    std::unique_lock<std::mutex> lock(mutex);
                    changed.wait(lock, [&] { return stopped || !ready.empty() || (next == total && in_use == 0); });
                    if (stopped || (ready.empty() && next == total && in_use == 0)) return;
                    id = ready.front();
                    ready.pop_front();
                    auto& s = slots[id];
                    require(s.state == State::VERIFIED, "consumer saw unverified data");
                    s.state = State::CONSUMING;
                    generation = s.generation;
                    trace("consume_start", id);
                    changed.notify_all();
                    // Hold the first lease until a producer actually observes both slots busy.
                    // No random sleep; requires >=3 chunks so another borrow is attempted.
                    if (gate && consumed == 0) {
                        changed.wait(lock, [&] { return stopped || gate_reached; });
                        if (stopped) return;
                        require(s.state == State::CONSUMING && s.generation == generation,
                                "held consumer buffer was reused");
                        trace("consumer_gate_open", id);
                    }
                }
                auto& s = slots[id];
                std::uint64_t sum = 0;
                for (std::size_t i = 0; i < s.length; ++i) {
                    require(s.bytes[i] == expected_byte(s.offset + i), "consumer payload mismatch");
                    sum += s.bytes[i];
                }
                {
                    std::lock_guard<std::mutex> lock(mutex);
                    require(s.state == State::CONSUMING && s.generation == generation, "ownership lost");
                    ++consumed;
                    verified_bytes += s.length;
                    checksum += sum;
                    trace("consume_done", id);
                    s.state = State::FREE;
                    --in_use;
                    trace("release", id);
                    changed.notify_all();
                }
            }
        } catch (...) { fail(); }
    }
public:
    Pipeline(std::uint64_t size, std::size_t c, std::size_t n, std::string u, bool g, bool t)
        : slots{Slot(c), Slot(c)}, total(size), chunk(c), outstanding(n), url(std::move(u)), gate(g), tracing(t) {}
    void run() {
        begin = Clock::now();
        // RAII async handles: creation failure also stops and joins tasks already started.
        std::vector<std::thread> workers;
        try {
            workers.emplace_back([&] { consumer(); });
            for (std::size_t i = 0; i < outstanding; ++i) workers.emplace_back([&] { producer(); });
        } catch (...) {
            fail();
        }
        for (auto& t : workers) t.join(); // all curl callbacks/consumer writes physically stopped
        if (error) {
            // Failed slots never publish; only recycle after all workers have joined.
            for (auto& s : slots) s.state = State::FREE;
            ready.clear();
            std::rethrow_exception(error);
        }
        require(verified_bytes == total && consumed == submitted && in_use == 0 && inflight == 0 && ready.empty(),
                "pipeline resources/data not closed");
        if (gate) require(gate_reached && pool_waits > 0 && peak == 2, "backpressure gate not exercised");
        const double seconds = std::chrono::duration<double>(Clock::now() - begin).count();
        std::cout << std::fixed << std::setprecision(6)
                  << "mode=local-http-cpu bytes=" << verified_bytes << " request_count=" << submitted
                  << " chunk_bytes=" << chunk << " outstanding=" << outstanding
                  << " elapsed_ms=" << seconds * 1000 << " throughput_mibps=" << verified_bytes / 1048576.0 / seconds
                  << " producer_waits=" << pool_waits + queue_waits << " backpressure_count=" << pool_waits
                  << " queue_waits=" << queue_waits << " peak_slots_in_use=" << peak
                  << " peak_inflight=" << peak_inflight << " peak_queue_depth=" << peak_queue
                  << " pool_payload_bytes=" << 2 * chunk << " checksum=" << checksum
                  << " consumed=" << consumed << " slots_free=2 inflight=0 ready=0\n";
    }
};
int main(int argc, char** argv) {
    try {
        require(argc >= 4, "usage: async_range_pipeline CHUNK_BYTES OUTSTANDING TOTAL_BYTES [--gate-consumer] [--trace]; PIPELINE_URL via env");
        auto chunk = number(argv[1]), n = number(argv[2]), total = number(argv[3]);
        require(chunk > 0 && chunk <= 8 * 1024 * 1024 && (n == 1 || n == 2) &&
                total > 0 && total <= 64 * 1024 * 1024, "sizes/concurrency outside lab bounds");
        bool gate = false, trace = false;
        for (int i = 4; i < argc; ++i) {
            const std::string a = argv[i];
            if (a == "--gate-consumer") gate = true;
            else if (a == "--trace") trace = true;
            else throw std::runtime_error("unknown option");
        }
        require(!gate || (total - 1) / chunk >= 2, "consumer gate needs at least three chunks");
        const char* raw = std::getenv("PIPELINE_URL");
        require(raw && *raw, "PIPELINE_URL required");
        std::string url(raw);
        require(url.rfind("http://127.0.0.1:", 0) == 0 && url.find('@') == std::string::npos,
                "pipeline fixture accepts only http://127.0.0.1:PORT");
        Global global;
        Pipeline(total, chunk, n, url, gate, trace).run();
    } catch (const std::exception& e) {
        std::cerr << "FAIL: " << e.what() << '\n';
        return 1;
    }
}
