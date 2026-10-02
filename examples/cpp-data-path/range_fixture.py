"""Shared deterministic localhost Range fixture; not an S3 service."""
import http.server
import re
import threading

MASK = (1 << 64) - 1


def expected_byte(offset):
    x = (offset + 0x9E3779B97F4A7C15) & MASK
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & MASK
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & MASK
    return (x ^ (x >> 31)) & 255


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def do_GET(self):
        case = self.path.split("?", 1)[0]
        match = re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers.get("Range", ""))
        if not match:
            self.send_error(400)
            return
        first, last = map(int, match.groups())
        payload = self.server.payload
        if first > last or last >= len(payload):
            self.send_error(416)
            return
        with self.server.counter_lock:
            self.server.requests += 1
            request = self.server.requests
        # Optional deterministic two-producer overlap proof, never a latency model.
        if self.server.barrier is not None and request <= 2:
            self.server.barrier.wait(timeout=10)
        body = payload[first:last + 1]
        status, header = 206, f"bytes {first}-{last}/{len(payload)}"
        if case == "/corrupt":
            body = bytes([body[0] ^ 1]) + body[1:]
        elif case == "/wrong-range":
            header = f"bytes {first + 1}-{last + 1}/{len(payload)}"
        elif case == "/no-range-header":
            header = None
        elif case == "/short":
            body = body[:-1]
        elif case == "/oversize":
            body += b"x"
        elif case == "/ignored-range":
            status = 200
        elif case == "/forbidden":
            status, body = 403, b"denied"
        self.send_response(status)
        if header is not None:
            self.send_header("Content-Range", header)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # clients deliberately abort invalid responses


class RangeServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, payload, barrier=None):
        super().__init__(("127.0.0.1", 0), Handler)
        self.payload = payload
        self.barrier = barrier
        self.requests = 0
        self.counter_lock = threading.Lock()
