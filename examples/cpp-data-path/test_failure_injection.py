"""Independent trace assertions supplement the simulator's runtime invariants."""
import subprocess
import sys

cases = ("timeout", "retry", "duplicate", "late", "partial", "consumer")
for case in cases:
    result = subprocess.run([sys.argv[1], case], text=True, capture_output=True, timeout=5)
    assert result.returncode == 0, result.stderr
    events = [dict(x.split("=", 1) for x in line.split()[1:])
              for line in result.stdout.splitlines() if line.startswith("t")]
    sequence = [e["event"] for e in events]
    for event in events:
        assert all(int(event[k]) >= 0 for k in ("inflight", "leases", "reservations"))
        if event["event"] == "RELEASE":
            assert event["state"] == "FREE" and all(event[k] == "0" for k in ("inflight", "leases", "reservations"))
        if event["event"] == "PUBLISH":
            assert int(event["logical_written"]) == 64 * 1024 * 1024
    release_ids = [e["allocation"] for e in events if e["event"] == "RELEASE"]
    assert len(release_ids) == len(set(release_ids)), "double free"
    publish_ids = [e["allocation"] for e in events if e["event"] == "PUBLISH"]
    assert len(publish_ids) == len(set(publish_ids)), "duplicate publish"
    if case in ("retry", "late"):
        expected = ["CALLER_TIMEOUT", "QUARANTINE", "PUBLISH", "LATE_WRITE",
                    "NEW_CONTENT_UNCHANGED", "LATE_COMPLETION"]
        positions = [sequence.index(e) for e in expected]
        assert positions == sorted(positions)
        old = events[0]["allocation"]
        new = next(e["allocation"] for e in events if e["event"] == "PUBLISH")
        assert old != new
        old_events = [e for e in events if e["allocation"] == old]
        assert next(e for e in old_events if e["event"] == "QUARANTINE")["inflight"] == "1"
        assert [e["event"] for e in old_events][-2:] == ["DRAIN", "RELEASE"]
        assert "POOL_EXHAUSTED_BACKPRESSURE" in sequence
        if case == "late":
            reuse = next(e for e in events if e["event"] == "REUSE_AFTER_DRAIN")
            assert int(reuse["generation"]) == int(events[0]["generation"]) + 1
            assert sequence.index("REUSE_AFTER_DRAIN") > next(
                i for i, e in enumerate(events) if e["allocation"] == old and e["event"] == "RELEASE")
    if case == "partial":
        assert not publish_ids
        partial = next(e for e in events if e["event"] == "PARTIAL_FAILURE")
        assert int(partial["logical_written"]) == 32 * 1024 * 1024 and partial["state"] != "READY"
    if case == "duplicate":
        assert sequence.count("PUBLISH") == sequence.count("RELEASE") == 1
        assert "DUPLICATE_REQUEST_SINGLE_FLIGHT" in sequence and "DUPLICATE_COMPLETION_IGNORED" in sequence
    if case == "consumer":
        assert sequence.index("CONSUMER_CANCEL_REQUESTED") < sequence.index("CONSUMER_STOPPED") < sequence.index("RELEASE")
    summary = result.stdout.splitlines()[-1]
    for term in ("inflight=0", "leases=0", "reservations=0", "quarantined=0"):
        assert term in summary
    print(result.stdout, end="")
print("PASS: six deterministic failure traces; CPU model only")
