---
title: Java 开发者的最小 C++ 数据路径实验
category: 动手练习
description: 从可运行的 ownership、异步生命周期练习走到只读 S3 Range GET，不依赖 GPU/RDMA。
---

# Java 开发者的最小 C++ 数据路径实验

这不是完整 C++ 课程，也不是完整 GPU KV Demo。你要交付的是：**自己编译、自己改一个条件、解释资源由谁持有，以及给出一次正确性验证。** 数据路径与状态机是 C++17；Python 用于计算模型、本地 HTTP fixture、扫描与结果验证，不承担 payload 数据路径。不改写 Dell ECS/ObjectScale 3 年 10 个月的 Java/Go/Python 主力经历；C++ 是当前转型练习。

| 实验 | 先读 | 通过标准 |
|---|---|---|
| 1. move 与拥有者 | [第二篇 §2]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-2) | 地址未变，owner 已转移；自己改过大小与内容 |
| 2. 异步 lifetime | 同上 | 函数退出后任务仍拥有源，consumer 持有目标；能定位错误版本 |
| 3. Range GET | [第二篇服务端读取]({{ site.baseurl }}/docs/02_GPU_Data_Path/#s3-server-read-prereq) | 206、Content-Range、长度和每个字节都正确；分清本地测试与真实 endpoint |

完整代码：[examples/cpp-data-path](https://github.com/miauyle/ai-storage-notes/tree/master/examples/cpp-data-path)。可在 GitHub 下载仓库 ZIP 后解压，无需为了读教程先学 git 工作流。以下命令均在仓库根目录运行。

<a id="cpp-build"></a>

## 0. 先跑通工具链

默认使用你的 OrbStack Linux 环境；以下安装命令面向 Ubuntu/Debian，不在 macOS 终端执行。原生 macOS 也可用支持 C++17 的编译器、CMake 和 libcurl ≥ 7.85，但本轮未在 Mac 实机验证；先固定一个 Linux 环境即可。

```bash
sudo apt-get update
sudo apt-get install -y g++ cmake libcurl4-openssl-dev python3
cmake -S examples/cpp-data-path -B build/cpp-labs -DCMAKE_BUILD_TYPE=Debug
cmake --build build/cpp-labs --parallel 2
ctest --test-dir build/cpp-labs --output-on-failure
```

`-S` 指源码目录，`-B` 指独立构建目录；CMake target 表示一个程序及其依赖，链接线程库和 libcurl 不等于安装 GPU 驱动。CTest 的五个测试套件覆盖 ownership、Range 契约、A 公式、B 有界流水、C 故障不变量。无需 GPU、RNIC 或 S3 credentials；Python 测试不要加 `-O`，以保留独立 trace 断言。

若 curl 开发包暂不可用，先用 `-DBUILD_S3_PROBE=OFF` 配置，完成实验 1/2。无 CMake 时也能验证第一个程序：

```bash
mkdir -p build/cpp-labs
g++ -std=c++17 -Wall -Wextra -pthread examples/cpp-data-path/ownership_lab.cpp -o build/cpp-labs/ownership_lab
./build/cpp-labs/ownership_lab
```

## 1. move 转移的是 ownership，不是搬运 payload

[ownership_lab.cpp](https://github.com/miauyle/ai-storage-notes/blob/master/examples/cpp-data-path/ownership_lab.cpp)先创建 `unique_ptr<vector<uint8_t>>`，保存 `data()` 地址，再把 owner 移交给 `next_owner`。

```cpp
auto next_owner = std::move(owner);
```

这里实际调用 `unique_ptr` 的移动操作，源指针变空，vector 和其 payload 地址不变。不是 CPU memcpy，也不是 GPU DMA；不要把“move”这个单词直接理解为数据搬运。

预期第一行输出：`ownership: moved owner, same payload address`。程序用运行时检查而非仅用 `assert`，不会因为 Release 关闭断言就自动“通过”。

**自己改：**把大小从 1024 改成 2048，把初始字节从 7 改成 9，同时更新验证。解释为什么只改初始字节、不改验证会失败。再指出 `owner` 移动后为什么不能继续解引用。

<a id="cpp-async-lifetime"></a>

## 2. 提交函数返回，不等于借出的地址可以释放

`start_copy()` 内创建 source，以 move capture 交给异步任务，函数返回 future。任务先等待一个 promise；主线程在 `start_copy()` 返回后才允许它读取 source，所以不靠碰运气的 sleep 验证时序。

关键关系是：

- 提交函数拥有 source → lambda 捕获并拥有 source → CPU copy 完成后可释放 source。
- 任务创建 destination → future 接收 ownership → `get()` 交给 consumer → consumer 用完才释放。

预期随后输出：

```text
async: submit function returned before copy was allowed
consumer: 4096 bytes verified; releasing destination
PASS: CPU ownership and async lifetime
```

这里 future 的契约覆盖的是这个 CPU 任务，不覆盖 CUDA 或远端 RNIC。真实数据路径必须把保活条件接到真实 completion/consumer，而不是照搬 `future.get()` 当万能同步。

### 故意出错，再定位

[bad_lifetime.cpp](https://github.com/miauyle/ai-storage-notes/blob/master/examples/cpp-data-path/bad_lifetime.cpp)保留裸地址后销毁 owner，再读取旧地址。它是单线程模拟迟到回调的最小反例，**故意包含未定义行为**，默认不编译、不纳入正常测试，只用于下面的 ASan 练习。

```bash
cmake -S examples/cpp-data-path -B build/cpp-asan -DBUILD_S3_PROBE=OFF -DBUILD_BAD_EXAMPLE=ON
cmake --build build/cpp-asan --target bad_lifetime
./build/cpp-asan/bad_lifetime
```

预期：程序非零退出，AddressSanitizer 报 `heap-use-after-free`；具体地址和堆栈依环境不同。沿报告找三处：分配、释放、非法读取。普通运行没有崩溃也不能证明安全。

**修复任务：**让真正执行读取的一方持有 owner，而不只是保存裸地址；对照正常实验解释 owner 为什么活得足够久。不要只把变量挪到全局，也不要仅加一段 sleep。

<a id="cpp-range-lab"></a>

## 3. C++ 只读 S3 Range GET：先做最小可验证切片

[s3_range_probe.cpp](https://github.com/miauyle/ai-storage-notes/blob/master/examples/cpp-data-path/s3_range_probe.cpp)使用 libcurl 发起 HTTPS GET。认证通过你自己为测试对象生成的短期预签名 URL 提供；这减少了首次实验的 SDK 构建负担，**没有绕过 S3 授权，也没有实现 SigV4、PUT、自动重试或完整 SDK**。需要这些功能时再使用正式 SDK。

它检查四件事：HTTP 206、精确 Content-Range、payload 长度、按绝对 offset 生成的预期 bytes。服务端忽略 Range 返回 200、范围不匹配、短读、多读、内容损坏，都不能算成功。

### A. 无账号先运行本地契约测试

```bash
python3 examples/cpp-data-path/test_range_probe.py build/cpp-labs/s3_range_probe
```

测试服务器只绑定 `127.0.0.1`，在内存中提供位置相关的确定性数据，注入以上错误并检查程序拒绝它们。结束自动关闭服务器；测试不连接 AWS、不创建桶、不使用云凭据。

**通过只说明：**C++ 程序的本地 HTTP/校验契约按测试预期工作。它不是 S3 实现，不能证明某个 S3-compatible endpoint 的实际行为，更不能证明 RDMA。

### B. 使用自己的测试桶验证真实路径（可选，可能产生请求/流量费用）

1. 生成一个 8 MiB 测试文件；若同名文件已存在，程序拒绝覆盖，换一个新名字。

   ```bash
   ./build/cpp-labs/s3_range_probe --generate fixture.bin 8388608
   ```

2. 用你已配置的存储控制台或 CLI，把文件上传到**专用测试桶的新 key**。不要覆盖业务对象，不要使用公司数据。实验期间该 key 不再修改；如果使用版本 URL，在生成签名时就固定 version ID，不在签名后手改 URL。
3. 为该对象生成短期 **GET 预签名 URL**，通过本地终端输入环境变量。只支持不要求额外签名头的 URL；若签名绑定了 Range，必须与本次范围一致。不要贴到聊天、日志、截图或 GitHub。

   ```bash
   # 在 bash 中执行；隐藏输入，避免把 URL 写进命令行参数或 shell 历史。
   read -r -s -p 'Presigned GET URL: ' S3_PROBE_URL
   export S3_PROBE_URL
   ./build/cpp-labs/s3_range_probe 4096 65536 8388608
   unset S3_PROBE_URL
   ```

第三个参数是完整对象的大小，前两个是起始 byte offset 和请求长度；此例请求 `4096..69631`，共 64 KiB。改成 `0 8388608 8388608` 会通过 Range 读取完整 fixture，但仍不是不带 Range 的普通 GET。

程序仅接受 HTTPS，开启证书与主机名验证，不跟随重定向，不打印 URL 或响应内容；HTTP 只在显式本地测试模式开放。环境变量仍是敏感信息，不是安全保险箱。URL 过期或返回 403 时重新核对权限/签名，不要关闭 TLS 验证。

### C. 解释结果，而不是只看 PASS

```text
mode=https-endpoint bytes=65536 http=206 content_range=ok byte_compare=ok request_ms=... verify_ms=... host_verified_ms=...
```

`request_ms` 从执行请求到响应体收完，包含 DNS/建连/TLS 等实际开销；`verify_ms` 覆盖状态/范围/内容验证；`host_verified_ms` 到所有验证结束。每次进程只有一次请求，没有连接复用和并发扫描，**不是完整性能 benchmark，也不能凭一个样本报告 p99**。

fixture 使用位置相关的非密码学生成器，并逐字节比较预期切片；这是测试内容正确性的手段，不是 S3 checksum 实现，也不把 ETag 当 MD5。真实数据可另接独立 checksum/manifest 验证。

**自己改：**改变 offset/length，预测请求终点；解释 `start + length - 1` 和边界检查。再给测试服务器增加一个错误响应，确认程序不会误报成功。能够改动和解释，才算你的动手证据。

<a id="cpp-demo-evidence"></a>

## 4. A/B/C 运行入口与 Demo M0/M1 边界

按 §0 构建后，从仓库根目录运行（`build/cpp-labs` 可替换为自己的构建目录）：

```bash
# A：参数扫描/CSV；是 estimated performance decision model，不是 GPU benchmark。
python3 examples/cpp-data-path/restore_recompute.py --tokens 2048 8192 32768 --bandwidth-gibps 8 20 40 --csv
# B：24 MiB 固定 workload，64 KiB/1 MiB/8 MiB × outstanding 1/2。
python3 examples/cpp-data-path/test_async_pipeline.py build/cpp-labs/async_range_pipeline build/cpp-labs/s3_range_probe
# B：显示 submit→verified→consume→release 与 pool wait 的原始 trace。
python3 examples/cpp-data-path/test_async_pipeline.py build/cpp-labs/async_range_pipeline build/cpp-labs/s3_range_probe --chunk 1048576 --outstanding 2 --trace
# C：重点展示 timeout→独立 retry→旧目标 late write→drain→可回收。
./build/cpp-labs/failure_injection_sim late
# 不传参数运行全部六类注入。
./build/cpp-labs/failure_injection_sim
```

A 输出 KV size、restore/recompute ms、crossover GiB/s 与 decision；`--latency-ms 50 --conversion-ms 10 --prefill-ms 60` 演示没有有限正 crossover。B 的固定两槽与容量 1 ready queue 不会因慢 consumer 无限分配；确定性 gate 保留首个 consumer lease，直到 producer 真正观察到 pool 满，线程用条件变量而非随机 sleep 协调。输出整轮 bytes/wall time、request count、wait 与 peak slots，允许异步负收益。每个 producer 复用自己的 curl handle；localhost 数字不是 S3/GPU/RDMA 性能。

C 每槽用 64 KiB 真实 bytes 表示 64 MiB 逻辑块，旧 worker 超时后仍实际写旧 allocation，不以 generation 检查偷偷阻止晚写。读取 trace 时区分 CALLER_TIMEOUT、LATE_COMPLETION/DRAIN 和 CONSUMER_DONE/STOPPED；它们不是同一回收点。重复通知不重复 publish/release；每个场景最后必须 `inflight=leases=reservations=quarantined=0`，否则非零退出。详细输入/输出 schema 与证据边界见[代码 README](https://github.com/miauyle/ai-storage-notes/blob/master/examples/cpp-data-path/README.md)。

| 当前完成了什么 | 可以说什么 | 下一步仍缺什么 |
|---|---|---|
| 实验 1/2 | 完成 CPU ownership/异步 lifetime 练习 | 真实网络、GPU、MR 的完成与回收 |
| 本地 HTTP 测试 | Range/内容校验与错误拒绝有测试 | 真实 S3 endpoint 验证 |
| 自己的 S3 fixture 读取通过 | 验证一条真实 S3→host Range 读取切片 | M0 完整要求的普通 GET、重试、重复采样与结果整理 |
| A/B/C 已实现并有自动测试 | performance decision model、CPU bounded pipeline、六类确定性故障及资源闭合 | 完整 KV manager/M1 平台、真实硬件路径证据 |

完整验收见[Demo 分阶段交付表]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#demo-stage-acceptance)。本页没有实现 KV manager、FakeGpuTier、真实 CUDA 或 RDMA，不因源文件叫 data-path 就宣称这些能力。

## 官方依据与验证边界

- [CMake CTest](https://cmake.org/cmake/help/latest/guide/tutorial/Testing%20and%20CTest.html)：构建与测试组织。
- [Clang AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html)：内存错误诊断，不是证明所有并发都正确。
- [libcurl Range](https://curl.se/libcurl/c/CURLOPT_RANGE.html) 与 [write callback](https://curl.se/libcurl/c/CURLOPT_WRITEFUNCTION.html)：范围可能被忽略；回调接收分片，不能假设一次拿到全部内容。
- [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html) 与 [预签名 URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)：授权和对象读取约束。

2026-09-26：编写并在 Linux/GCC 13.3 上验证 CPU 示例与本地 HTTP 契约；无真实 S3 账号、Mac、GPU 或 RNIC 集成结果。本仓库 CI 也只验证 CPU 与本地 HTTP，不代表这些环境已通过。

2026-10-03：实现 A/B/C，并在 Linux/GCC 13.3/libcurl 8.5 上运行五个 CTest 套件。CPU simulation completed，不等于 GPU/RDMA verified；真实 S3 M0 仍为 optional/manual verification。本阶段仓库建设到此收口，后续转为实际运行、闭卷复述、Interview Drills 和投递。
