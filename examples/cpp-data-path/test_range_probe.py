"""Local HTTP contract tests. No AWS account, S3 service, or GPU is used."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from range_fixture import RangeServer, expected_byte

binary = str(Path(sys.argv[1]).resolve())
payload = bytes(expected_byte(i) for i in range(8192))


def check(case, args, success, local=True):
    env = dict(os.environ, S3_PROBE_URL=f"http://127.0.0.1:{server.server_port}{case}?secret=do-not-log")
    command = [binary, *map(str, args)] + (["--local-test"] if local else [])
    result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=5)
    if (result.returncode == 0) != success:
        raise AssertionError((case, result.returncode, result.stdout, result.stderr))
    if "do-not-log" in result.stdout + result.stderr:
        raise AssertionError("URL credential leaked")
    if success and "byte_compare=ok" not in result.stdout:
        raise AssertionError("success lacks content verification")
    print(f"PASS: {case} {args}")


server = RangeServer(payload)
worker = threading.Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    check("/ok", [17, 1024, 8192], True)
    check("/ok", [8191, 1, 8192], True)
    check("/ok", [0, 8192, 8192], True)
    for case in ("/corrupt", "/wrong-range", "/no-range-header", "/short", "/oversize", "/ignored-range", "/forbidden"):
        check(case, [17, 1024, 8192], False)
    for args in ([0, 0, 8192], [8190, 3, 8192], [-1, 10, 8192], [0, 1, 67108865], ["1x", 1, 8192]):
        check("/invalid-input", args, False)
    check("/reject-plain-http", [0, 1, 8192], False, local=False)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "fixture.bin"
        subprocess.run([binary, "--generate", str(path), "8192"], check=True, capture_output=True)
        if path.read_bytes() != payload:
            raise AssertionError("generated fixture differs from independent oracle")
        again = subprocess.run([binary, "--generate", str(path), "8192"], capture_output=True)
        if again.returncode == 0:
            raise AssertionError("fixture was overwritten")
        print("PASS: fixture generation and overwrite refusal")
finally:
    server.shutdown()
    server.server_close()
    worker.join()
print("PASS: local HTTP contracts only; real S3 integration remains unverified")
