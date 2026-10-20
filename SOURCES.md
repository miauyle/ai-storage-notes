---
layout: doc
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

<a id="2026-10-storage-refresh"></a>

## 2026-10-21 AI Storage 维护核对（北京时间）

本轮仅核对下表范围；发布日期与核实日期分开。代码合并、库 GA、平台公告、路线图与本仓库实测不是同一证据。下方旧 API/版本条目不因本表自动刷新。

| 官方/原始来源 | 发布/证据状态 | 本轮采用与限制 |
|---|---|---|
| [DeepInfer README](https://github.com/deepseek-ai/DeepInfer) | 2026-10 开源，按本次 main 快照 | 离线引擎与完整 KV/P-D/负载均衡范围分开；未声称已接本站后端 |
| [V4.1-Flash 报告 v1 §2/3.2](https://arxiv.org/html/2609.19969v1)、[模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) | 报告 2026-09-17；模型卡浮动 | 跨层共享/低位缓存与 bounded replay；强调近似状态、口径差异，不用压缩倍率推算总 HBM |
| [Qwen 官方仓库](https://github.com/QwenLM/Qwen3.8)、[vLLM hybrid manager](https://docs.vllm.ai/en/latest/design/hybrid_kv_cache_manager/) | Qwen 仓库保留 Qwen3.5 介绍；vLLM 为带警告的设计快照 | 递归/滑窗/普通 KV 不同；不声明任意混合架构已支持同一恢复协议 |
| [Mooncake 更新记录](https://github.com/kvcache-ai/Mooncake/blob/main/README.md)、[TRT-LLM #19171](https://github.com/NVIDIA/TensorRT-LLM/pull/19171) | Store/TE 集成记录；TRT PR 2026-10-10 merged | LMCache MP、FlexKV、vLLM/LMDeploy、KVCMv2 集成与多模态缓存；不保证跨引擎布局互换 |
| [Dynamo #11239](https://github.com/ai-dynamo/dynamo/pull/11239) | 2026-07-31 merged，Mooncake 8 月更新介绍 | KV event 索引案例；本文 epoch/对账/回退协议为教学设计，不归功于该 PR |
| [HiCache 设计](https://docs.sglang.io/docs/advanced_features/hicache_design) | 在线实现说明，未虚构本月首次发布 | 预取停止、写回和 rank 一致边界；不照搬默认 timeout 为 SLO |
| [cuObject / xio-sig / SCADA 公告](https://developer.nvidia.com/blog/expanding-ai-storage-access-with-nvidia-cuobject-and-the-nvidia-scada-server-sdk/) | 2026-09-30；库 GA、协议开放有条件、SDK 公告 | GPU-direct 与 GPU-initiated 分开；不是所有 S3 已互通，不更改旧 client/server API 支持快照 |
| [CMX 技术公告](https://developer.nvidia.com/blog/introducing-nvidia-bluefield-4-powered-inference-context-memory-storage-platform-for-the-next-frontier-of-ai/) | 2026-03-16 平台公告 | G3.5 为平台层级用语；不采用宣传倍率，不推断耐久与部署支持 |
| [Weight Cache Daemon](https://www.lmsys.org/blog/2026-08-21-sglang-fast-recovery) | 2026-08-21 实现介绍，含后续路线图 | CUDA IPC 权重存活域、恢复阶段分开；不把 warm/加载速度当完整服务启动速度 |
| [SGLang P2P 更新](https://www.lmsys.org/blog/2026-04-29-p2p-update/) | 2026-04-29 实现介绍 | 在线权重搬运不等于 checkpoint；版本切换协议为教学设计 |
| [TorchSpec](https://pytorch.org/blog/torchspec-speculative-decoding-training-at-scale/) | 2026-03-19 框架介绍 | 中间状态流替代全量落盘的案例；不推广原 benchmark；缓冲算例为假设 |
| [DSec 报告](https://arxiv.org/abs/2609.22978) | 2026-09 技术报告 | 3FS 镜像按需加载与沙箱/训练生命周期；不声称完整平台开源 |
| [vLLM prefix caching](https://docs.vllm.ai/en/stable/design/prefix_caching/) | 本轮复核现有 cache_salt 能力 | salt 隔离不替代授权、ACL 与加密；不是新发布宣称 |

所有新增容量/延迟数字是教学输入。Experiment A 只验证串行三候选成本与决策，不实现模型、SWA、状态兼容或质量评估。实际接入仍需记录 release/tag/commit，测试同输入恢复、输出/质量、错误与资源寿命。复查触发：引擎/模型/后端升级，恢复策略或租户共享策略变化，或开始引用产品性能数字。

## LLM 前置依据（2026-10-13，北京时间）

| 原始/官方来源 | 本次核对范围 | 边界 |
|---|---|---|
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | Attention 的投影、scaled dot-product 与多头机制 | 原文是 encoder-decoder；前置采用 decoder-only 基线，教学矩阵自行构造 |
| [GQA 原始论文](https://arxiv.org/abs/2305.13245) | 多个 query heads 共享较少 KV heads | 不把结构转换讲成无训练的配置开关 |
| [Transformers How caching works](https://huggingface.co/docs/transformers/main/cache_explanation) | 自回归缓存依赖与逐层历史 K/V 复用 | main 在线机制说明，不新增框架 API/版本兼容声明 |
| [PyTorch Tensor attributes](https://docs.pytorch.org/docs/stable/tensor_attributes.html) | Shape/dtype 与 FP16/BF16/FP8 位数 | 不声称任意硬件支持任意 dtype；量化 metadata 另算 |
| [NVIDIA GPU Performance](https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html)、[Matrix Multiplication](https://docs.nvidia.com/deeplearning/performance/dl-performance-matrix-multiplication/index.html) | 计算、内存、延迟限制，2mkn 与算术强度模型 | 仅机制；教学 100 TFLOP/s、1 TB/s 等不是硬件规格或 benchmark |

四篇前置的模型几何、显存预算、延迟与带宽都是明确假设下的教学推演。仅本表为本轮核对，不刷新下方旧技术条目的核实日期。无 GPU/RDMA 实测或 Demo 实现变更。

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
