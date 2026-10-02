"""Run B with a deterministic localhost fixture. Output times are local CPU/HTTP only."""
import argparse
import contextlib
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from range_fixture import RangeServer, expected_byte


@contextlib.contextmanager
def fixture(payload, overlap=False):
    server = RangeServer(payload, threading.Barrier(2) if overlap else None)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


def run(binary, payload, chunk, outstanding, case="/ok", gate=True, trace=False, overlap=False):
    with fixture(payload, overlap) as server:
        args = [binary, str(chunk), str(outstanding), str(len(payload))]
        if gate:
            args.append("--gate-consumer")
        if trace:
            args.append("--trace")
        env = dict(os.environ, PIPELINE_URL=f"http://127.0.0.1:{server.server_port}{case}?secret=do-not-log")
        result = subprocess.run(args, env=env, capture_output=True, text=True, timeout=40)
        if "do-not-log" in result.stdout + result.stderr:
            raise AssertionError("URL leaked")
        return result


def fields(line):
    return dict(item.split("=", 1) for item in line.split())


def verify_trace(output):
    slots = {0: ("FREE", 0), 1: ("FREE", 0)}
    transitions = {"submit": ("FREE", "FILLING"), "verified": ("FILLING", "VERIFIED"),
                   "consume_start": ("VERIFIED", "CONSUMING"), "release": ("CONSUMING", "FREE")}
    for line in output.splitlines():
        if not line.startswith("t_us="):
            continue
        f = fields(line)
        slot, gen = int(f["slot"]), int(f["generation"])
        before, old_gen = slots[slot]
        if f["event"] in transitions:
            expected, after = transitions[f["event"]]
            assert before == expected, (f, before)
            expected_gen = old_gen + 1 if f["event"] == "submit" else old_gen
            assert gen == expected_gen and f["state"] == after
            slots[slot] = (after, gen)
        assert int(f["queue_depth"]) <= 1 and int(f["slots_in_use"]) <= 2
    assert all(state == "FREE" for state, _ in slots.values())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("binary")
    p.add_argument("probe", help="existing s3_range_probe generates fixture locally")
    p.add_argument("--chunk", type=int, help="run one size instead of full scan")
    p.add_argument("--outstanding", type=int, choices=[1, 2], help="one concurrency instead of full scan")
    p.add_argument("--trace", action="store_true")
    args = p.parse_args()
    binary, probe = str(Path(args.binary).resolve()), str(Path(args.probe).resolve())
    total = 24 * 1024 * 1024  # fixed for all six scan points, >=3 largest chunks
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "fixture.bin"
        subprocess.run([probe, "--generate", str(path), str(total)], check=True, capture_output=True, timeout=20)
        payload = path.read_bytes()
        # Independently check fixture generation at positions across all chunks.
        for offset in (0, 65535, 65536, 1048575, 1048576, 8388607, 8388608, total - 1):
            assert payload[offset] == expected_byte(offset)
        for chunk in ([args.chunk] if args.chunk else [65536, 1048576, 8388608]):
            for n in ([args.outstanding] if args.outstanding else [1, 2]):
                result = run(binary, payload, chunk, n, trace=True, overlap=n == 2)
                if result.returncode:
                    raise AssertionError(result.stderr)
                verify_trace(result.stdout)
                summary = fields(result.stdout.splitlines()[-1])
                assert int(summary["bytes"]) == total
                assert int(summary["request_count"]) == (total + chunk - 1) // chunk
                assert int(summary["consumed"]) == int(summary["request_count"])
                assert int(summary["pool_payload_bytes"]) == 2 * chunk
                assert int(summary["peak_slots_in_use"]) == 2
                assert int(summary["peak_inflight"]) == n  # barrier forces actual overlap for n=2
                assert int(summary["backpressure_count"]) > 0
                assert summary["slots_free"] == "2" and summary["inflight"] == "0" and summary["ready"] == "0"
                print(result.stdout if args.trace else result.stdout.splitlines()[-1], end="\n")
        # Includes final short chunk; ordinary ungated run is also supported.
        small = bytes(expected_byte(i) for i in range(16385))
        result = run(binary, small, 8192, 2, gate=False, trace=True)
        assert result.returncode == 0, result.stderr
        verify_trace(result.stdout)
        for case in ("/corrupt", "/wrong-range", "/no-range-header", "/short", "/oversize", "/ignored-range", "/forbidden"):
            result = run(binary, small, 8192, 2, case, gate=False, trace=True)
            assert result.returncode != 0 and "event=enqueue" not in result.stdout, (case, result.stdout)
            print(f"PASS reject={case} no_unverified_publish")
        for command in (["0", "1", "1"], ["1", "3", "1"], ["8388609", "1", "1"],
                        ["-1", "1", "1"], ["1", "1", "2", "--gate-consumer"]):
            result = subprocess.run([binary, *command], capture_output=True, timeout=5)
            assert result.returncode != 0
    print("PASS: bounded CPU pipeline/local HTTP only; not S3/GPU/RDMA performance")


if __name__ == "__main__":
    main()
