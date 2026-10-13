---
title: LLM 前置三：Tensor 与显存计算
category: LLM 前置基础
description: 从数组形状和每元素字节数逐项推导 Weights、Activations、KV 与显存预算。
---

# LLM 前置三：Tensor 与显存计算

[推理篇]({{ site.baseurl }}/docs/00b_LLM_Inference/)解释了什么状态会增长。本篇把它算成容量。全篇采用**等层、全注意力、K/V 同 head dimension 与 dtype 的教学模型**，不默认所有真实模型符合这套几何结构。

<a id="tensor-shape"></a>

## 1. Tensor 是带 Shape 和 Dtype 的多维数组

对 Java/Go 工程师，可以先把 tensor 理解为数值 buffer 加形状、元素类型和步长等描述。一个标量没有数组轴；向量 `[3]` 有 3 个数；矩阵 `[2,3]` 有 6 个数；三维 `[2,3,4]` 有 24 个数。**Shape 描述每个轴长度，不是 bytes。** 稠密、无填充数组的 payload 为各轴长度乘积，再乘每元素字节数。

例如逻辑数组 `[batch=2,tokens=3,width=4]`，有 `2×3×4=24` 个元素。若 FP16，每元素 2 bytes，共 48 bytes。索引 `[1,2,3]` 是第二个请求、第三个 token、第四个坐标，轴从 0 开始编号。

矩阵乘法 `[m,k]×[k,n]→[m,n]` 的中间轴必须相等。每个输出是 k 个乘积之和：前篇 `X[3,4096]×W_K[4096,1024]` 产生 `K[3,1024]`，然后可按 8 个 head、每 head 128 个坐标解释成 `[3,8,128]`。reshape 是重新解释坐标，通常不增加元素；transpose 改变轴顺序，可能只是视图，也可能需要实际重排。

逻辑 shape 不保证物理连续。分页、stride、padding、量化 scale 和跨 GPU 分片都会改变真实占用与传输布局。能算 payload 之后，还要单独说明格式开销，而不是给公式乘一个无依据的“安全倍数”。

<a id="dtype"></a>

## 2. 为什么 FP16 是 2 Bytes

bit 是一个二进制位；byte 是 8 bits。FP16 的 16 表示一个数的编码位数，因此 `16 bits ÷ 8 bits/byte = 2 bytes`。它与 K/V 的“两份数组”无关，也不是两个 token。

浮点数编码大体由符号、指数和有效数字组成。指数决定大致能覆盖的大小范围，有效数字决定同一尺度下可分辨的精度。位数少通常节约容量/流量，但不代表计算结果完全一样。

| Dtype | 每元素编码位数 | 裸元素 bytes | 数值边界 |
|---|---:|---:|---|
| FP32 | 32 | 4 | 1 符号位、8 指数位、23 尾数位 |
| FP16 | 16 | 2 | 1/5/10 位；较窄指数范围 |
| BF16 | 16 | 2 | 1/8/7 位；指数范围与 FP32 相近，精度不同 |
| FP8 | 8 | 1 | 常见 E4M3/E5M2 等不同格式，不能只凭名字确定范围 |

FP16 与 BF16 的裸容量相同，但数值性质不同。FP8/量化常需 scale 或其他元数据，并要求 kernel/硬件支持相应格式。**权重量化不自动量化 KV**；计算输入格式、累加格式、权重格式与 KV 存储格式也可能不同。容量题必须分别询问，而不是从“模型是 FP16”推断所有中间状态都用 2 B。

数据类型位数可核对 [PyTorch Tensor attributes](https://docs.pytorch.org/docs/stable/tensor_attributes.html)；这里不声明任意 GPU 对任意 FP8 格式的支持。

<a id="weights-activations"></a>

## 3. Weights、Activations 与 KV 是怎样的数组

**Weights** 是多次调用共享的参数；每个权重 tensor 有固定形状，比如投影矩阵 `[4096,1024]`。假设整模型恰有 P 个参数、全都以每参数 bw bytes 保存，裸容量 `P×bw`。7B FP16 的 14 GB 只是这一个项，GB 为 `10^9 bytes`，GiB 为 `2^30 bytes`。

**Activations** 是前向计算产生的中间数值，包括每层表示、Q/K/V、attention 输出和 FFN 中间结果；KV 是其中需要供后续生成长期使用的特定部分。显存预算中把“长期保留 KV”和“其他临时 activations/workspace”分开，避免重复计数。

例如本模型 `d_model=4096`，一次 prefill 8,192 tokens，本层一个 `[8192,4096]` 的 FP16 表示有 `33,554,432` 个元素，乘 2 B 得 `67,108,864 bytes=64 MiB`。它只是一个数组，不是整个 activation 峰值。Q/K/V、FFN 更宽的中间结果、多个并发 kernel 的工作区和 allocator 保留区可能同时存在。

如果直接物化 32 个 Q heads 的 `[8192,8192]` FP16 attention 分数矩阵，大小会是 `32×8192×8192×2=4 GiB`；有效 attention kernel 可以按块计算，避免完整物化，所以不能把这个朴素中间量当作所有引擎的必需占用。推理中临时数组可在使用后回收或复用；训练为反向传播可能保留更多中间状态，因此不能把训练显存公式原样搬到推理。

<a id="kv-formula"></a>

## 4. 从一个位置推导完整 KV 公式

先定义变量，不把参数量 P 与 token 数混用：

| 符号 | 来源 | 含义/单位 | 本例 |
|---|---|---|---:|
| L | 模型结构/config | 需要保存 KV 的层数，层 | 32 |
| Hq | 模型结构 | Query heads 数；不直接用于 KV payload | 32 |
| Hkv | 模型结构/config | 每层 KV heads 数，head | 8 |
| D | 模型结构/config | 每个 head 的坐标数，元素/head | 128 |
| b | KV dtype | 每元素 bytes；此处 K/V 相同 | 2 |
| T | tokenizer 与当前请求 | 已处理并保留的 token 数，token | 8,192 |

**第一步：一层、一个 token、一个 KV head。** K 是 D 个浮点数，V 也是 D 个浮点数，共 `2×D` 个元素。前面的 2 是 **K 与 V 两份**。每元素 b bytes，所以占 `2×D×b bytes`。

**第二步：一层、一个 token、所有 KV heads。** 每个 head 都要保留 K/V，共 `2×Hkv×D×b bytes`。本例是 `2×8×128×2=4096 bytes=4 KiB`。

**第三步：一个 token、所有层。** 每层有不同的 KV，乘 L 得：

$$
s_{\rm token}=2\times L\times H_{kv}\times D\times b
$$

每 token `2×32×8×128×2=131,072 bytes=128 KiB`。前面 2 是数组份数，最后 2 是 FP16 的 bytes/element；来源完全不同。

**第四步：一个请求的 T 个 token。** 每个位置保留相同几何数量的状态：

$$
S_{\rm request}=T\times s_{\rm token}
=2\times L\times T\times H_{kv}\times D\times b
$$

代入 `8192×131072=1,073,741,824 bytes=1 GiB`。这些是 KV payload，不含模型权重、临时空间、索引、对齐或量化 metadata。8K 在本仓库算例中指 8,192，而非 8,000。

**第五步：多个长度不同且不共享的请求。** 请求 i 的保留长度为 Ti，统一模型与 KV dtype 时：

$$
S_{\rm total}=s_{\rm token}\sum_{i=1}^{N}T_i
$$

若 N 个请求都长 T，才可简化为 `N×T×s_token`。100 个独立 8,192-token 请求共 100 GiB KV；并发 100 不代表模型权重要装 100 份。共享前缀后应按物理唯一的 KV 页计数，不能再无条件把各请求逻辑长度相加。

这也可以从 tensor shape 验证：每层 K、V 各为逻辑 `[N,Hkv,T,D]`（假设等长请求），两份乘层数、再乘 b，与逐步推导一致。具体引擎轴顺序不同不影响元素总数。

<a id="pages-chunks"></a>

## 5. Page、逻辑传输块与对象 Range 的换算

Page 是引擎分配 KV 的粒度；本例取 p=16 tokens。一页每层有 `2×16×8×128×2=65,536 bytes=64 KiB`。跨 32 层汇总是 `32×64 KiB=2 MiB`，但它不保证是一个连续的全层物理 buffer。

8,192 tokens 需要 `8192/16=512` 个 page 单位。若传输按 512 tokens 聚合，即每块 `512/16=32` 个 page 单位；全层 payload 为 `32×2 MiB=64 MiB`，共 `8192/512=16` 块。**Page 管分配，chunk 管搬运，两种粒度不等价。**

如果请求长 17 tokens、不能与其他请求共享尾页，则需要 `ceil(17/16)=2` 页，预留 32 tokens 的页容量。若是两请求共享 512-token prefix、各有独立 16-token suffix，理想按完整页共享时逻辑长度合计 1,056 tokens，物理只存 `512+16+16=544` tokens，即 `544×128 KiB=68 MiB`。每请求各复制全部状态则是 132 MiB。实际引用计数和 copy-on-write 另算。

若教学对象格式恰为无头部、无 padding 的连续 64 MiB payload，第一个块对应 S3 inclusive Range `bytes=0-67108863`，第二个块从 `67108864` 开始。真实格式有 manifest/header/分片时必须由布局元数据换算；attention 逻辑 page 编号不能直接当对象 byte offset，更不能当 GPU pointer。

<a id="memory-budget"></a>

## 6. 算出显存还剩多少，再接纳请求

可用显存不是标称 HBM 全部。假设教学部署统一使用 GiB：进程实际可用 24 GiB；权重占 13.04 GiB（前文恰好 7B FP16）；临时 activation/kernel/运行时预留合计 3 GiB，安全余量 1 GiB。则留给 KV：

$$
M_{KV}=M_{usable}-M_{weights}-M_{temporary}-M_{reserve}
=24-13.04-3-1=6.96\;GiB
$$

本模型每 GiB 能放 `2^30/2^17=8192` tokens，约可放 `floor(6.96×8192)=57,016` tokens，页取整后还会略少。6 个 8,192-token prompt 共 49,152 tokens，看似放得下；若各输出最多 2,048 tokens，保守需求 `6×(8192+2048)=61,440` tokens，即 7.5 GiB，超过预算。

所以**输入阶段放得下不代表生成期间不会 OOM**。Admission control、最大输出、动态 token budget、抢占或其他策略需要覆盖增长。3 GiB 临时空间只是假设：真实 prefill/decode、batch、kernel 和 allocator 峰值须测量，不应将本例数字作为推荐配置。

<a id="formula-boundaries"></a>

## 7. 什么时候不能照抄公式

全注意力、等层同几何是本式前提。滑动窗口可能限制某些层的保留长度；混合结构逐层不同；压缩/latent 表示可能根本不是两份同形状 K/V；量化增加 scale，且转换改变兼容契约。可按层实际 tensor 元素数与 dtype 求和，而不是继续硬套常数。

跨 GPU 时也不能自动把 KV 除以 GPU 数。Tensor parallel 可能按 heads 分片，也可能复制部分 KV；pipeline parallel 则按层分配。每卡权重、KV、workspace 和通信 buffer 都要按实际布局算。只知道总参数量与 GPU 数不够。

## 8. 闭卷变式与答案

把本例改为 `L=24,Hkv=4,D=128,BF16`：每 token `2×24×4×128×2=49,152 bytes=48 KiB`；4,096 tokens 为 `4096×48 KiB=192 MiB`。若只把 KV 改为 FP8、忽略 scale，裸 payload 变为 96 MiB；若只量化权重，KV 仍是 192 MiB。

再答“为何不能用 Hq=32 计算原例 GQA KV？”因为只保存 8 套 K/V，多组 Q 读取共享状态；32 套 Q 不是 32 套长期 KV。

能够从“一层一个位置的一对向量”自行重建公式，就可进入已有[容量、布局与生命周期]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#chapter-4)。下一篇[GPU 与存储衔接]({{ site.baseurl }}/docs/00d_GPU_Storage_Bridge/)把 bytes 换成时间。
