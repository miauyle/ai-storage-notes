# C++ data-path learning exercises

Read the [Chinese hands-on tutorial](https://miauyle.github.io/ai-storage-notes/docs/04_CPP_Labs/)
for explanations, expected output, deliberate bug/fix exercises and scope boundaries.

Requirements: C++17 compiler, CMake >= 3.16, libcurl development package >= 7.85,
Python >= 3.9 for the local fixture tests. No GPU or S3 credentials are needed for tests.

From the repository root:

```bash
cmake -S examples/cpp-data-path -B build/cpp-data-path -DCMAKE_BUILD_TYPE=Debug
cmake --build build/cpp-data-path --parallel 2
ctest --test-dir build/cpp-data-path --output-on-failure
```

Five CTest suites cover ownership, A calculations, B pipeline, C failure invariants,
and the existing Range probe. Python test scripts must run without `-O` (their
independent trace checks use assertions); C++ checks remain enabled in Release.

## A/B/C: runnable engineering evidence

| Experiment | Proves | Does not prove |
|---|---|---|
| A · Python decision model | Units, restore/recompute decision, crossover and no-positive-crossover boundary | Actual Prefill or GPU/storage performance |
| B · C++ CPU/localhost HTTP | Two owning slots, verified-only queue (capacity 1), bounded concurrency, backpressure and consumer lifetime | S3, pinned memory, GPU or RDMA throughput |
| C · C++ deterministic events | Timeout ≠ stopped worker; isolated retry, late writes, dedup, partial/cancel safety, closed resources | Device cancellation, registration, visibility or hardware drain |

Run from repository root:

```bash
# A: estimated 60 ms Prefill is independently supplied for every length.
python3 examples/cpp-data-path/restore_recompute.py --tokens 2048 8192 32768 --bandwidth-gibps 8 20 40 --csv
# A: no finite positive crossover (fixed latency + conversion >= recompute).
python3 examples/cpp-data-path/restore_recompute.py --tokens 8192 --latency-ms 50 --conversion-ms 10 --prefill-ms 60
# B: starts/stops the local fixture, scans 64 KiB/1 MiB/8 MiB × outstanding 1/2.
python3 examples/cpp-data-path/test_async_pipeline.py build/cpp-data-path/async_range_pipeline build/cpp-data-path/s3_range_probe
# B: one trace; first consumer waits until pool exhaustion is observed, no sleeps.
python3 examples/cpp-data-path/test_async_pipeline.py build/cpp-data-path/async_range_pipeline build/cpp-data-path/s3_range_probe --chunk 1048576 --outstanding 2 --trace
# C: six scenarios, or just the timeout/retry/late-write sequence.
./build/cpp-data-path/failure_injection_sim
./build/cpp-data-path/failure_injection_sim late
```

A accepts `--bytes-per-token` or `--kv-bytes`, `--latency-ms`,
`--conversion-ms` (conversion/visibility), `--prefill-ms` and
`--compute-queue-ms`. Bandwidth is **effective GiB/s**, not Gbps or NIC peak.
CSV includes all inputs, `kv_bytes/kv_gib`, `restore_ms`, `recompute_ms`,
`crossover_gibps` (empty when absent), and `decision`; numerical ties choose recompute.
Redirect stdout to a local CSV if desired; do not commit machine benchmark times.

B holds exactly two pre-sized vectors (`2 × chunk_bytes`), reuses one curl easy
handle per producer, and keeps each buffer until consumer verification finishes.
The workload is fixed at 24 MiB; a server barrier forces two GETs to overlap when
outstanding=2, and the first consumer gate deterministically exercises pool
backpressure. These gates are correctness devices, **not a realistic slow-network
or slow-consumer latency distribution**. Ungated binary usage is also supported:
`PIPELINE_URL=http://127.0.0.1:PORT/ok ./build/cpp-data-path/async_range_pipeline CHUNK_BYTES OUTSTANDING TOTAL_BYTES [--trace]`.
It deliberately accepts only localhost HTTP fixtures, never a real S3 endpoint.

B trace: `t_us/event/slot/generation/attempt/offset/length/state/queue_depth/slots_in_use/inflight/inflight_bytes`;
events include submit, body_done, verified, enqueue, consume_start/done, release
and producer waits. Summary: `bytes/request_count/chunk_bytes/outstanding/elapsed_ms/throughput_mibps`,
wait counts, peak slots/inflight/queue, pool payload bytes, checksum and final
resource counts. Throughput is consumed-and-verified bytes divided by the **whole
run's steady-clock wall time**, including gates and checks; negative async benefit
is acceptable. Do not derive cloud or production conclusions from localhost times.

C uses **64 KiB real payload per slot / 64 MiB logical size** and two allocation
slots. Each trace includes request/attempt/allocation/generation, state, published
flag, written bytes, inflight, leases and reservations. Cases are `timeout`, `retry`,
`duplicate`, `late`, `partial`, `consumer`; `late` also demonstrates reuse in a new
generation only after old drain. Worker lease survives logical timeout; consumer
cancellation keeps its lease until explicit consumer stop. Repeated completion or
drain does not publish/release twice. Every scenario must exit with
`inflight=leases=reservations=quarantined=0`, otherwise the program fails.

Use `-DBUILD_S3_PROBE=OFF` to run ownership, A and C without libcurl (B is disabled).
The intentional use-after-free example is opt-in (`BUILD_BAD_EXAMPLE=ON`),
not part of the default build or tests. It must fail under AddressSanitizer.

The HTTPS probe accepts a GET URL through `S3_PROBE_URL`, checks HTTP 206,
Content-Range, byte count, and every byte against a deterministic fixture.
Do not log or commit the URL. Use only a new key in an authorized test bucket.
The program never uploads objects or creates buckets; fixture generation is local
and refuses to overwrite an existing file. TLS verification is enabled.

Local HTTP tests are NOT S3 integration tests. One real Range GET is only a slice
of M0, not the complete benchmark/retry exercise. None of this implements CUDA,
GPU memory, RDMA or a KV cache manager. A/B/C implement only the stated
decision/local CPU correctness slices, not the full M0/M1 platform. Real S3 M0
remains optional/manual verification with an authorized endpoint.
