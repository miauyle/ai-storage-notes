---
layout: page
title: 技术来源与版本台账
description: 记录高变化技术陈述的官方来源、核实边界与复查触发条件。
---

# 技术来源与版本台账

本文件用于维护会随软件、硬件或在线文档变化的陈述。三份教程负责解释概念；本台账负责说明“依据什么、何时需要重查”。它不是依赖锁文件，也不保证链接指向的 `latest` 页面永久保持相同内容。

## 使用规则

1. 教程中的通用机制与教学假设分开：教学数字明确标为输入，不需要伪装成厂商实测。
2. 涉及 API、支持矩阵、experimental/preview、硬件型号或版本的陈述，必须链接官方来源。
3. 实现或面试准备时，记录实际 `GPU / NIC / driver / CUDA / framework / backend` 组合；不能用本台账日期替代环境验证。
4. 当 `latest` 页面内容改变时，优先更新陈述和核实日期；需要复现实验时另存 release/tag/commit，而不是依赖浮动链接。
5. 每次事实复核只更新真正检查过的条目，不把局部复核写成全项目已刷新。

## 高变化来源

| 主题 | 官方来源 | 项目使用的边界 | 项目核实口径 | 何时必须重查 |
|---|---|---|---|---|
| CUDA Runtime 同步 | [API synchronization behavior](https://docs.nvidia.com/cuda/cuda-runtime-api/api-sync-behavior.html) | `cudaMemcpy*` 的 host 同步/异步边界 | 2026-09-20 按在线页面复核 | CUDA major/minor 升级；修改 pageable/pinned 表述 |
| CUDA Stream/Event | [Asynchronous execution](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html) | stream 顺序、event 依赖、并发不保证 | 2026-09-20 按在线页面复核 | 添加具体 overlap 性能结论 |
| GPUDirect RDMA | [官方指南](https://docs.nvidia.com/cuda/gpudirect-rdma/index.html) | peer memory、ordering、平台/API 边界 | 2026-09-19 文档快照 | 选择具体 GPU/NIC/driver；实现 visibility 协议 |
| GPUDirect Storage | [Overview](https://docs.nvidia.com/gpudirect-storage/overview-guide/index.html)、[Release Notes](https://docs.nvidia.com/gpudirect-storage/release-notes/index.html) | cuFile、direct/fallback、平台支持 | 2026-09-19 文档快照 | 安装或升级 GDS；声称某路径 direct |
| cuObject overview / API | [Overview](https://docs.nvidia.com/gpudirect-storage/cuobject/index.html)、[Client API](https://docs.nvidia.com/gpudirect-storage/cuobject/cuObjClient-api/index.html) | S3 控制请求 + RDMA data plane；GET→server WRITE、PUT→server READ；GPU/system memory；client cuObjGet/cuObjPut 同步，不等同 server async | 2026-10-03 在线快照；overview 更新日 2026-10-02；未集成实测 | SDK/server、memory kind、operation 或 completion 契约改变 |
| cuObject releases | [Client notes](https://docs.nvidia.com/gpudirect-storage/cuobject/cuobject-client-release-notes/index.html)、[Server notes](https://docs.nvidia.com/gpudirect-storage/cuobject/cuobject-server-release-notes/index.html) | client v1.3.1 / CUDA 13.4.1（2026-09-16），server v2.0.0 / CUDA 13.4（2026-08-18）；client 多 NIC failover/token reset 与 server event completion/multi-VIP 分开 | 2026-10-03；两页更新日 2026-10-02；注意 ABI 与 stale key/drain 限制 | 安装、升级、选择具体双端组合，或声称透明 failover |
| vLLM Paged Attention | [设计页](https://docs.vllm.ai/en/latest/design/paged_attention/) | 用于理解分页原理，不声明当前全部实现 | 2026-09-19；项目已标明历史设计边界 | 对接具体 vLLM release/backend |
| vLLM Prefix Caching | [设计页](https://docs.vllm.ai/en/latest/design/prefix_caching/) | parent hash、完整块和隔离的概念依据 | 2026-09-20 按在线页面复核 | 使用具体 hash algorithm 或配置名 |
| vLLM KV Offloading | [官方文章](https://vllm.ai/blog/2026-01-08-kv-offloading-connector) | 发布时设计与结果，不外推为通用 benchmark | 2026-09-20 | 引用性能数字；对接当前 connector API |
| LMCache | [Overview](https://docs.lmcache.ai/)、[Compatibility](https://docs.lmcache.ai/getting_started/compatibility.html) | 外层 KV 管理定位；兼容性取决于组合 | 2026-10-03 复核管理入口与兼容性页；在线快照，不锁定任意 release 组合 | 选择 vLLM/LMCache/model/backend 组合 |
| libibverbs | [`ibv_reg_mr`](https://man7.org/linux/man-pages/man3/ibv_reg_mr.3.html)、[`ibv_post_send`](https://man7.org/linux/man-pages/man3/ibv_post_send.3.html)、[`ibv_poll_cq`](https://man7.org/linux/man-pages/man3/ibv_poll_cq.3.html) | MR 权限、post 与 completion 语义 | 2026-09-20 按手册页复核 | 使用具体 provider/transport 特性 |
| RoCE / RDMA | [NVIDIA RDMA-aware guide](https://networking-docs.nvidia.com/doca/archive/3-5-0/rdma-aware-networks-programming-guide) | 用户态对象与数据路径；不是 wire protocol 全教程 | 2026-09-19 使用 3.5.0 archive | 部署具体网络、DC/RC 或拥塞控制 |
| S3 API | [GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)、[Multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | 对象 range/multipart 语义，不代表任意 GPU 扩展 | 2026-09-19 | 依赖具体 endpoint 的一致性、重试或扩展行为 |

## 本轮 Modern Stack 核对（2026-10-03，北京时间）

| 官方来源 | 核对事实 | 通用原理 / 教学抽象的边界 |
|---|---|---|
| [NIXL repository](https://github.com/ai-dynamo/nixl) | memory/storage 抽象与插件式 point-to-point transfer；本次读 main README | 分层职责是本文框架，不把所有插件当任意引擎 connector 已支持的能力；接入时锁定 tag/commit |
| [vLLM NixlConnector Usage](https://docs.vllm.ai/en/latest/features/nixl_connector_usage/) | P/D 异步 transfer、默认 UCX 与可选 backend | 2026-10-01 文档快照；库名不能证明实际 RDMA/GPU-direct path，NIXL 不替代 cache policy |
| [vLLM NixlConnector Compatibility](https://docs.vllm.ai/en/latest/features/nixl_connector_compatibility/) | 默认 handshake hash；model 几何/dtype/backend/version；异构 TP/block/layout 与 quantization 的条件限制 | 2026-09-28 页面；本文三层 contract 不是 vLLM hash schema，不宣称它验证全部权重 revision/tenant |
| [SGLang P/D](https://docs.sglang.io/docs/advanced_features/pd_disaggregation) | runtime 的 P/D 交接可用 Mooncake / NIXL transfer engine | 只核对定位，未声称所有模型、memory/layout、版本组合兼容 |
| [LMCache 管理](https://docs.lmcache.ai/kv_cache_management/index.html) | 跨实例 KV 管理入口 | 未将管理能力等同 NIXL 搬运，未引用旧 blog 性能为当前结果 |
| [Mooncake repository](https://github.com/kvcache-ai/Mooncake) | Transfer Engine 与 Store 分开；Store 使用 TE 提供共享缓存后端 | 本次 main README 快照；不新增完整部署教程或外推 README benchmark |

Modern Stack、三类远端场景、Compatibility Contract 是本文的 system design 判断框架；官方事实仅限上表。A/B/C 是实验设计，A 数字是教学计算，B/C 未在本轮实现；不能从来源复核推定硬件/集成已通过。未修改 NVIDIA Dynamo 的版本/功能陈述，本轮不新增 Dynamo 教程。

## C++ 实验来源（2026-09-26）

| 来源 | 本次使用范围 | 验证边界 |
|---|---|---|
| [CMake FindCURL](https://cmake.org/cmake/help/latest/module/FindCURL.html)、[CTest](https://cmake.org/cmake/help/latest/guide/tutorial/Testing%20and%20CTest.html) | imported target 与本地测试组织 | 示例要求 CMake ≥ 3.16、C++17、libcurl ≥ 7.85 |
| [Clang ASan](https://clang.llvm.org/docs/AddressSanitizer.html) | opt-in heap-use-after-free 练习 | 不把检测不到错误当正确性证明 |
| [libcurl Range](https://curl.se/libcurl/c/CURLOPT_RANGE.html)、[write callback](https://curl.se/libcurl/c/CURLOPT_WRITEFUNCTION.html) | 范围响应校验、分片写回调与有界 buffer | 本地 fixture 不是 S3 兼容性测试 |
| [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)、[预签名 URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | 单 Range GET、对象授权和有效期 | 需用户自己的测试 endpoint；本次不声明真实云或硬件已验证 |

## 硬件规格来源

| 硬件 | 来源 | 教程使用方式 |
|---|---|---|
| NVIDIA H100 | [产品页](https://www.nvidia.com/en-us/data-center/h100/) | HBM、memory bandwidth、NVLink 的数量级；不当作端到端实测 |
| NVIDIA H200 | [产品页](https://www.nvidia.com/en-us/data-center/h200/) | HBM 容量与 bandwidth 的型号示例 |
| AMD EPYC 9654 | [产品页](https://www.amd.com/en/products/processors/server/epyc/4th-generation-9004-and-8004-series/amd-epyc-9654.html) | DDR 通道理论规格；不替代 memcpy/NUMA 测量 |
| ConnectX-7 | [Datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/networking/ethernet-adapters/connectx-7-datasheet-Final.pdf) | 400 Gbps 型号系列示例；不无条件合并端口 |

## 实验环境记录模板

准备真实 CUDA/RDMA/GDS/cuObject 实验时，把以下信息与结果一同保存：

```text
Date:
Host / CPU / NUMA:
GPU model and count:
NIC model, link mode and speed:
PCIe topology:
OS / kernel:
GPU driver / CUDA toolkit:
RDMA core / provider / firmware:
Framework and commit or release:
Storage backend and release:
Data path requested:
Evidence that the path actually ran:
Payload size / concurrency / direction / units:
Correctness and completion condition:
Known fallback or unsupported cases:
```

只有上述环境和证据齐全时，项目中的教学数字才可以被替换为“某环境实测”。
