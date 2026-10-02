"""Serial performance decision model, NOT a GPU/storage benchmark. Units are explicit."""
import argparse
import csv
import math
import sys

GIB = 2**30


def calculate(tokens, bytes_per_token, bandwidth_gibps, latency_ms,
              conversion_ms, prefill_ms, compute_queue_ms=0, kv_bytes=None):
    values = (tokens, bytes_per_token, bandwidth_gibps, latency_ms,
              conversion_ms, prefill_ms, compute_queue_ms)
    if not all(math.isfinite(v) for v in values):
        raise ValueError("inputs must be finite")
    if tokens <= 0 or bytes_per_token <= 0 or bandwidth_gibps <= 0:
        raise ValueError("tokens, bytes/token and bandwidth must be positive")
    if min(latency_ms, conversion_ms, prefill_ms, compute_queue_ms) < 0:
        raise ValueError("costs must be nonnegative")
    size = tokens * bytes_per_token if kv_bytes is None else kv_bytes
    if not math.isfinite(size) or size <= 0:
        raise ValueError("KV size must be finite and positive")
    fixed = latency_ms + conversion_ms
    recompute = prefill_ms + compute_queue_ms
    restore = fixed + size / GIB / bandwidth_gibps * 1000
    crossover = size / GIB * 1000 / (recompute - fixed) if recompute > fixed else None
    if not math.isfinite(restore) or not math.isfinite(recompute):
        raise ValueError("derived time overflow")
    # Conservative numerical ties: reciprocal bandwidth can round an exact crossover
    # to 59.99999999999999 ms. Do not claim a speedup from that floating-point noise.
    faster = restore < recompute and not math.isclose(restore, recompute, rel_tol=1e-12, abs_tol=1e-9)
    return dict(mode="decision-model", tokens=tokens, bytes_per_token=bytes_per_token,
                kv_bytes=size, kv_gib=size / GIB, bandwidth_gibps=bandwidth_gibps,
                latency_ms=latency_ms, conversion_ms=conversion_ms,
                prefill_ms=prefill_ms, compute_queue_ms=compute_queue_ms,
                restore_ms=restore, recompute_ms=recompute,
                crossover_gibps=crossover,
                decision="restore" if faster else "recompute")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tokens", type=int, nargs="+", default=[2048, 8192, 32768])
    size = p.add_mutually_exclusive_group()
    size.add_argument("--bytes-per-token", type=int, default=128 * 1024)
    size.add_argument("--kv-bytes", type=int, help="explicit size, same size for each token label")
    p.add_argument("--bandwidth-gibps", type=float, nargs="+", default=[8, 20, 40])
    p.add_argument("--latency-ms", type=float, default=5)
    p.add_argument("--conversion-ms", type=float, default=0)
    p.add_argument("--prefill-ms", type=float, default=60,
                   help="independent estimate shared by scan, not a token-to-compute prediction")
    p.add_argument("--compute-queue-ms", type=float, default=0)
    p.add_argument("--csv", action="store_true", help="CSV to stdout; absent crossover is an empty field")
    args = p.parse_args()
    try:
        rows = [calculate(t, args.bytes_per_token, b, args.latency_ms,
                          args.conversion_ms, args.prefill_ms, args.compute_queue_ms,
                          args.kv_bytes) for t in args.tokens for b in args.bandwidth_gibps]
    except ValueError as e:
        p.error(str(e))
    if args.csv:
        writer = csv.DictWriter(sys.stdout, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    else:
        for row in rows:
            print(" ".join(f"{k}={v if v is not None else 'none'}" for k, v in row.items()))


if __name__ == "__main__":
    main()
