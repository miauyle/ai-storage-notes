---
title: AI Storage 闭卷训练册
category: 学习与验收
description: 用诊断、随机变体、限时口述和错题复测，把三份教程转化为面试能力。
---

# AI Storage 闭卷训练册

> 这不是第四份教程，而是三份教程的练习入口。第一次作答时不要打开正文。  
> 本训练册刻意不附完整答案；作答后再按题目给出的章节定位核对。  
> 除非题目另有说明，本文的 `1K tokens = 1,024 tokens`。

## 0. 使用规则

每道题按同一流程练习：

1. **闭卷作答：**先说结论，再画路径或写公式，最后给边界条件。
2. **限时：**30 秒回答只给骨架；2 分钟回答必须包含一个机制、一个数字或时序、一个不成立的条件。
3. **核对：**打开对应正文，只记录遗漏或错误，不抄整段答案。
4. **变体：**至少修改一个输入，例如并发、带宽、KV heads、故障时机或 SLO，再回答一次。
5. **复测：**错题在第 1、3、7 天重新闭卷作答；连续两次达到 2 分才移出错题表。

### 统一评分 rubric

| 分数 | 表现 | 典型问题 |
|---:|---|---|
| 0 | 定义或方向错误，无法继续推导 | 把 KV 当权重；把 S3 GET 固定说成 RDMA READ |
| 1 | 能说定义，但没有机制、数量级或完成条件 | 只说“RDMA bypass CPU” |
| 2 | 机制正确，能画路径或完成计算，也能说明一个边界 | 能区分 submit、complete 与 GPU ready |
| 3 | 条件变化后会重算或改变方案，并说明验证证据 | 带宽/重算成本改变后切换 restore/recompute |

**通过标准：**MUST KNOW 题至少 2 分；容量、buffer lifetime、RDMA completion、半块不发布和安全回收不得为 0 分。不要用平均分掩盖概念性错误。

<a id="day0-diagnosis"></a>

## 1. Day 0 诊断

在阅读正文前或复习一轮后，限时 45 分钟完成。先保存答案，再查看章节定位。

| # | 闭卷任务 | 时间 | 核对位置 |
|---:|---|---:|---|
| 1 | 解释为什么缓存 K/V 而不是长期缓存旧 Q；说明有 KV 后仍未消失的工作 | 3 分钟 | [Document 1 §1]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-1) |
| 2 | 写出 KV payload 公式；计算 `L=32,Hkv=8,D=128,T=8192,FP16` | 4 分钟 | [Document 1 §4]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-4) |
| 3 | 把上题改成 MHA 的 32 个 KV heads，再算 100 并发 | 3 分钟 | [Document 1 §4]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-4) |
| 4 | 画 Prefill、Decode 时间轴，分别标出主要服务指标 | 3 分钟 | [Document 1 §3]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-3) |
| 5 | 解释 PagedAttention 解决和没有解决的问题 | 3 分钟 | [Document 1 §5]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-5) |
| 6 | 比较 pageable→GPU、pinned→GPU、RNIC→GPU 三条路径 | 5 分钟 | [Document 2 §3～4]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-3) |
| 7 | 一个 H2D async API 已返回，分别说明 host 源和 device 目标何时能复用 | 3 分钟 | [Document 2 §2～3]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-2) |
| 8 | 沿一次 RDMA WRITE 串起 PD/MR/QP/WR/SGE/lkey/rkey/CQ | 5 分钟 | [Document 2 §5]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-5) |
| 9 | 区分 GPUDirect RDMA、GDS 和 GPU-aware Object Storage | 4 分钟 | [Document 2 §6～7]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-6) |
| 10 | 计算 64 MB 在 100/200/400 Gbps 上的理论下界 | 3 分钟 | [Document 3 §6]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-6) |
| 11 | 走一次 object hit→GPU ready；说出至少四个不能省略的状态 | 5 分钟 | [Document 3 §3]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-3) |
| 12 | timeout 后旧 RDMA WRITE 可能迟到，设计安全 retry | 4 分钟 | [Document 3 §5]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-5) |

### 诊断后的分流

- 第 1～5 题任一为 0：从 Document 1 开始，不先读系统设计。
- 第 6～9 题任一为 0：Document 2 的 ownership、CUDA 顺序和 RDMA lifecycle 不可跳过。
- 第 10～12 题任一为 0：先重走 Document 3 的 performance model 和状态机，再做 45 分钟设计。
- 全部至少 2 分：停止顺序重读，直接进入下面八条追问链和目标 JD 校准。

<a id="drill-chains"></a>

## 2. 八条追问链

每次只练一条链。L1 是开场，L2 要求机制或计算，L3 会改变条件，不能复读原答案。

### 链 A：为什么需要 KV，为什么会放不下

1. **L1：**What is KV Cache, and why does autoregressive inference need it?
2. **L2：**从张量维度推导公式；解释 GQA 为什么降低 bytes，但不保证整个模型缩小同样比例。
3. **L3：**56 GiB KV budget、40 个 8K 请求初始可容纳；若每个还生成 4K，是否仍安全？必须重算并保留运行时余量。
4. **反例：**启用 PagedAttention 后仍 OOM。列出“真实工作集增长、allocator 保留、资源泄漏”三类可证伪假设。

核对：[Document 1 §1、§4]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-1)；[Document 3 §7.5]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-7)。

### 链 B：分页、共享、分层分别省什么

1. **L1：**PagedAttention 与 prefix caching 各解决什么问题？
2. **L2：**两个请求共享完整 prefix page，其中一个结束；说明引用、索引和物理页何时可以释放。
3. **L3：**1 GiB prefix，恢复固定成本 5 ms；分别在 8、20、40 GiB/s 下与 60 ms 重算比较。
4. **反例：**远端 hit rate 90%，TTFT p50 改善但 ITL p99 变差。给出区分争用与调度变化的实验。

核对：[Document 1 §5～7]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-5)；[Document 3 §7.5]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-7)。

### 链 C：Host 数据怎样安全进入 GPU

1. **L1：**为什么 pinned memory 对异步 H2D 有价值？
2. **L2：**画 pageable、pinned、peer DMA 三条路径，标出 CPU copy、DMA 和仍存在的控制路径。
3. **L3：**copy event 已完成但 consumer kernel 尚未完成；源和目标分别能否回池？
4. **代码阅读：**异步函数只保存裸指针，调用方的两个 RAII lease 在函数退出时析构。指出两个独立 lifetime bug。

核对：[Document 2 §2～4]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-2)。

### 链 D：RNIC 怎样合法完成一次远端访问

1. **L1：**RDMA 为什么快？答案中禁止只说 “CPU bypass”。
2. **L2：**server 向 client target 执行 WRITE：指出本地 SGE/lkey、远端 address/rkey、WR 和 CQ 分别属于谁。
3. **L3：**本地 completion 成功后，远端应用为何可能仍不知道数据已就绪？设计通知和发布顺序。
4. **故障：**调用者 timeout 后是否可立即 deregister MR？说明必须等待或撤销什么。

核对：[Document 2 §5]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-5)。

### 链 E：GPU-direct 改了哪一段路径

1. **L1：**比较 GPUDirect P2P、GPUDirect RDMA 和 GDS。
2. **L2：**为何 GPU pointer、MR 注册和 RDMA completion 仍不足以证明 attention 可以消费？
3. **L3：**确认 direct path 生效、host DRAM traffic 降低，但 end-to-end latency 不变。按优先级列出下一轮实验。
4. **布局题：**对象是连续 64 MiB blob，attention 需要分散 pages；比较直接 scatter 与 GPU staging+转换。

5. **NIXL — SHOULD KNOW：**用六个职责定位 NIXL、RDMA、UCX、LMCache、Mooncake TE/Store、vLLM connector；解释为什么传输抽象不能替代缓存策略。UCX 只要求层次定位（NICE TO KNOW），不背配置/API。

核对：[Document 2 §6～8]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-6)。
NIXL 核对：[六问收口]({{ site.baseurl }}/docs/02_GPU_Data_Path/#nixl-interview)。

### 链 F：对象语义怎样与 RDMA data plane 共存

1. **L1：**为什么不直接用一个自定义 RDMA protocol 替代 S3？
2. **L2：**分别画 GET 和 PUT；不要根据对象操作名猜 RDMA READ/WRITE 方向。
3. **L3：**一次 PUT 的 RNIC READ completion 成功，为什么仍不能立即向用户报告对象已耐久？
4. **安全题：**descriptor 泄漏或迟到写可能造成什么？说明权限、范围、generation 和物理隔离各能解决什么、不能解决什么。

核对：[Document 2 §7]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-7)。

### 链 G：把系统设计闭合

1. **L1：**用 2 分钟给出 GPU-aware distributed KV cache 的设计概览。
2. **L2：**走 `lookup→reserve→load→validate→publish→acquire→evict`，说明每步的不变量。
3. **L3：**对象层失效后所有 miss 改为重算。如何避免 Prefill 风暴拖垮仍在 Decode 的请求？
4. **规模题：**目录 page 粒度产生 512 次 lookup；在不改变 GPU page 大小的前提下降低 metadata 放大。

5. **Compatibility — MUST KNOW：**同模型名、同 tokens、checksum 正确，但 TP/layout/backend 或量化 scale 不同。分别判断 identity、representation、runtime；哪些可转换，哪些必须 miss？当前产品支持与设计原则如何区分？

核对：[Document 3 §1～6]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-1)。
兼容性核对：[Contract]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-compatibility-contract)。

<a id="cold-kv-drill"></a>

### 链 H：冷 Prefix KV 怎样经 S3 进入 GPU — 目标岗位主线

沿用 `L=32,Hkv=8,D=128,FP16` 的 8K prefix：payload 为 1 GiB，分成 16 个 64 MiB 逻辑传输块。面试官改变一个条件时，应沿**同一个请求**继续推导，不拆成三道名词题。

1. **L1：**哪些请求该留 HBM，哪些适合 P/D 直接交接，哪些冷 Prefix 值得写 S3？假设现在目录命中冷 Prefix，先回答是否恢复。
2. **L2：**有效 8 GiB/s、固定及转换 8 ms、重算 400 ms。算简化 load-to-ready，再沿 `S3 Range GET → 服务端读取/EC → TCP/Host 或 RDMA/GPU → layout → READY` 画完整路径，标注源/目标与校验。
3. **L3：**重算突然降到 60 ms，或后端 EC read amplification 令对象→Host 只有 2 GiB/s。分别重新决策；RDMA 能省掉哪段，为什么它可能救不了后端瓶颈？提出一个 A/B 测量。
4. **故障：**RDMA 只写完一半便 timeout；同时第二个请求复用同一 Prefix。怎样隔离旧目标、single-flight/独立 retry、控制重算风暴，并确认何时可以发布或回收 buffer？
5. **证据：**报告 `load-to-GPU-ready p99`、TTFT/ITL goodput、避免的 Prefill GPU 时间、对象读放大及 host/PCIe/NIC 流量。若手上只有 Mac 上的真实 S3→Host probe 和 CPU 模拟，应分别说明它们能证明什么。

6. **场景收口 — MUST KNOW：**把 P/D Transfer、Distributed KV Cache、Object Storage Tier 放进同一请求流程，指出不同目的与生命周期；不能只给三个产品名。
7. **无硬件证据：**A 给出命中却重算的参数点；B 慢 consumer 时画 queue/free slots；C 画 timeout→late write→drain。按[排障矩阵]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#inference-troubleshooting)对 GPU idle 或 p99 spike 提出可证伪实验。已运行与待实现分别报告。

核对：[Document 1 §7.4]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-7) → [Document 2 §7.9]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-7) → [Document 3 §1.6、§8.12]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#chapter-1)。

## 3. 随机算题生成器

不要重复背贯穿算例。每次从各列任选一个值，并明确哪些组合只是教学输入。

| 参数 | 可选值 |
|---|---|
| Layers `L` | 24 / 32 / 48 / 80 |
| KV heads `Hkv` | 1 / 4 / 8 / 16 / 32 |
| Head dimension `D` | 64 / 128 |
| Tokens `T` | 2,048 / 8,192 / 16,384 / 32,768 |
| Datatype | 1 B / 2 B；若使用 1 B，补充 scale/兼容性说明 |
| Concurrency | 10 / 40 / 100 |
| Shared prefix | 0% / 25% / 50% / 75% |
| Effective bandwidth | 4 / 8 / 20 / 40 GiB/s |
| Fixed load cost | 2 / 5 / 20 ms |
| Recompute cost | 40 / 100 / 400 ms |

每组必须输出：

1. bytes/token、bytes/request、总 payload；
2. 共享前缀后的物理 payload；
3. restore-to-ready 的简化估算；
4. restore 或 recompute 的选择；
5. 一个会使选择反转的条件。

**停止并纠错的信号：**没有先写单位；把 Gbps 当 GB/s；把理论 payload 当真实 HBM 使用量；把 metadata hit 当 GPU-ready hit；把可重叠阶段全部无条件相加或取最大值。

## 4. 英文口述

下列十一题各录制一次 30 秒和一次 2 分钟版本。2 分钟版本采用：`definition → mechanism/path → quantitative example → boundary/tradeoff`。

1. What is KV Cache, and why is it a capacity bottleneck?
2. How do Prefill and Decode create different storage requirements?
3. What problem does PagedAttention solve?
4. When is object storage a reasonable KV cache tier?
5. Why is pinned host memory important for GPU data movement?
6. Why is RDMA fast, and where does the CPU still participate?
7. What is the difference between GPUDirect RDMA and GPUDirect Storage?
8. How can S3 semantics coexist with an RDMA data plane?
9. When is an asynchronously loaded GPU buffer safe to consume and reuse?
10. How would you design and validate a GPU-aware distributed KV cache?
11. When should a reusable KV prefix be restored from S3 to GPU memory instead of recomputed, and what makes it safe to consume?

录音复核只检查四件事：是否先回答问题、是否出现一个具体机制、是否有一个数字/时序、是否主动给出边界。不要把中文答案逐字翻译成长句。

<a id="weekly-gates"></a>

## 5. 每周 Gate

| Gate | 限时输出 | 通过条件 |
|---|---|---|
| Day 7 | 链 A/B；两组随机 KV 算题；画分页共享图 | 容量与共享计算均正确，能解释 restore vs recompute |
| Day 14 | 链 C/D；画三条 GPU path 与一次 RDMA WRITE | source/target lifetime、lkey/rkey 和 completion 无方向错误 |
| Day 21 | 链 E/F，含 NIXL 六问；64 MB/64 MiB 传输题；一次故障重试 | 不混淆 GDR/GDS/S3；NIXL SHOULD KNOW 达机制深度，不把 timeout 当硬件停止 |
| Day 26 | 45 分钟系统设计 + 15 分钟追问，包含链 G/H | 区分三类远端 KV；冷 Prefix 兼容、恢复/重算、GPU Ready 与 A/B/C 证据边界闭合 |
| Day 29 | 随机十题，其中五题用英文 | 每题至少 2 分；核心不变量无 0 分 |

### 已有项目也要闭卷，不只练新名词

按[三条项目追问链]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#ecs-project-drills)分别练一次复制、在线迁移和 CRR。每次 15 分钟：3 分钟讲本人工作，8 分钟追问失败/状态/验证，4 分钟复盘。记录缺少的是事实、机制还是证据；需要翻私有材料的地方留待核对，不补写成假经历。

C++ 加一个动手 Gate：在[实验]({{ site.baseurl }}/docs/04_CPP_Labs/)中自己修改 buffer 大小或 Range，预测结果、重新编译并解释一次失败。区分“代码测试通过”和“本人能解释”；只完成本地 fixture，不填“真实 S3 已验证”。这些练习计入[现有时间预算]({{ site.baseurl }}/docs/00_Study_Guide/#time-budget)，不是新增一周。

## 6. 错题记录模板

不要记录“这章没背熟”，要记录错误机制。

```text
Date:
Question / changed condition:
My answer score (0-3):
Error type: definition | direction | unit | lifetime | completion | assumption | evidence
The exact wrong sentence or calculation:
Correct invariant in one sentence:
One new variant to retest:
Retest D+1 / D+3 / D+7:
```

最值得统计的不是题目命中率，而是错误类型是否反复出现。例如总把 completion 当 remote ready，说明需要重走整条顺序链，而不是继续背更多 API。

## 7. 用真实 JD 校准最后一周

不要凭职位标题猜考点。每拿到一个目标 JD，只提取可观察证据：职责、required、preferred、面试语言和明确技术栈。

| JD 原文要求 | 频次 | 当前证据 | 差距 | 本月动作 |
|---|---:|---|---|---|
| 示例：C++ ownership / concurrency |  | Document 2 代码阅读；若已完成，再填 C++ Demo M0/M1 | 是否缺现场 coding | 写最小 RAII/异步回收测试，未实现不写成已有编码经验 |
| 示例：RDMA / GPUDirect debugging |  | 路径图、诊断清单 | 无真实硬件结果 | 如实写模拟边界；准备验证方案 |
| 示例：checkpoint / dataset pipeline |  | Document 1 §2、对象存储经历 | 缺 AI workload 案例 | 补一个已有故障经验的迁移表述 |

建议至少收集 10 个相近岗位后再改 MUST/SHOULD。某项只在一个 JD 出现，不自动扩写成新章节；高频出现且当前无证据时，才进入下一轮内容计划。
