---
title: 如何使用本教程
category: 学习与验收
description: 按 90/60 小时预算学习、动手和复测，把已有对象存储经验转成面试证据。
---

# 如何使用本教程

目标不是读完所有页面，而是在约一个月内，能把 **已有 ECS/ObjectScale 项目、AI workload 判断、GPU 数据路径和一个小型 C++ 实验**讲清楚，并开始投递。学习与投递可以并行，真实 GPU/RDMA 实验不是入场券。

已有生产经验：Java 为 ECS chunk replication、在线迁移和 ObjectScale CRR 功能开发主力；Go telemetry 用于运行数据采集和统计分析，Python 曾用于工作。日志与 chunk DT 表属于生产排障证据。新的 C++ 练习、GPU/RDMA 知识与旧项目经历分别表达，不能互相冒充。

<a id="start-here"></a>

## 1. 今天从哪里开始

1. 先花 45 分钟做[Day 0 诊断]({{ site.baseurl }}/docs/00_Interview_Drills/#day0-diagnosis)，保存原答案，再核对正文。
2. KV 机制/容量有 0 分题，先读[第一篇]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/)；ownership/完成条件有 0 分题，先读[第二篇]({{ site.baseurl }}/docs/02_GPU_Data_Path/)。
3. 已能独立画路径、算容量，就进入[第三篇]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/)和闭卷追问，不继续从头顺读。
4. C++ 只读得懂但写不动，做[最小 C++ 实验]({{ site.baseurl }}/docs/04_CPP_Labs/)；先在 CPU 上解决资源拥有关系，再接 S3。

每次学习只留一个可检查的输出：一张路径图、一组算例、一次两分钟口述，或一个自己改过且测试通过的程序。不要把复制正文当成输出。

## 2. 读到什么程度就停

| 标记 | 达标动作 | 不要求 |
|---|---|---|
| MUST KNOW | 脱稿解释机制、画路径/算数量级，条件改变后重做判断 | 背 API 参数或完整 schema |
| SHOULD KNOW | 说清作用、约束和取舍，知道怎样验证 | 实现所有后端 |
| NICE TO KNOW | 知道它改变了哪个假设 | 通读源码 |
| SKIP FOR NOW | 除非目标 JD 明确要求，否则先跳过 | 为了“完整”无限补课 |

各主教程开头有“第一遍阅读导航”。章节里的 30 秒回答是起手骨架；两分钟回答要加一个机制、一个数字或时序，以及一个边界条件。先理解，再遮住答案复述，最后改变输入重做。

**2026 inference stack 收口：**用[Modern KV Stack]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#modern-kv-stack)替换框架名词的重复阅读，再区分[三类远端 KV]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#remote-kv-scenarios)并核对[Compatibility Contract]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-compatibility-contract)。场景区分与兼容判断为 MUST KNOW；[NIXL 六问]({{ site.baseurl }}/docs/02_GPU_Data_Path/#nixl-interview)为 SHOULD KNOW，UCX 只到 NICE TO KNOW 的层次定位。不开 API/源码教程，不增加总学习预算。

**长 schema、状态名、接口签名是查阅材料。** 重点是完整后发布、在途资源不能提前回收、恢复成本与重算成本的比较。会背状态名却不能解释一次失败，不算通过。

<a id="time-budget"></a>

## 3. 90 小时与 60 小时：动手不是额外加班

以下都是规划预算，不是保证学会的工时。每天约 3 小时，按实际卡点调整；C++ 新手遇到工具链问题时缩范围，不挤掉投递。

| 用途 | 90 小时版 | 60 小时版 |
|---|---:|---:|
| 定向阅读与概念纠错 | 30 h | 20 h |
| 闭卷算题、路径图、追问与复测 | 24 h | 16 h |
| 已有项目深挖与口述 | 12 h | 10 h |
| C++ 所有权实验与 M0 起步 | 12 h | 6 h |
| JD 对照、投递与反馈复盘 | 12 h | 8 h |
| 合计 | 90 h | 60 h |

若这轮不做代码，把动手预算分给错题与项目追问；若 JD 核心考 C++，就把实验设为优先，减少已掌握部分的重复阅读。**M1 模拟默认不排入这 90 小时**；只有核心题已过关且有余量才替换其他安排。

读书日可以用 90 分钟阅读、60 分钟输出、30 分钟纠错；实验日改为 120 分钟编码、30 分钟解释 ownership、30 分钟记录失败。两种日程互相替换，不叠加成六小时。

<a id="thirty-days"></a>

## 4. 30 天安排：按输出推进

章节号对应三篇主教程；“链”对应闭卷训练册。第二周起即可小批量投递匹配岗位，不必等全部完成。

| 时间 | 主任务 | 当阶段交付/停止线 |
|---|---|---|
| Day 1～3 | 第一篇 §1～3 | token→attention→KV；讲清 Prefill/Decode 和服务指标 |
| Day 4～5 | 第一篇 §4 | 换模型参数算容量；解释共享与输出增长 |
| Day 6～7 | 第一篇 §5～7；链 A/B | 恢复/重算的数字判断；完成 Day 7 Gate |
| Day 8～10 | 第二篇 §1～2；C++ 实验 1/2 | ownership 转移与异步保活程序通过；能解释错误版本 |
| Day 11～14 | 第二篇 §3～5；链 C/D | 三条 GPU 路径、一次 WRITE 的资源与完成顺序；Day 14 Gate |
| Day 15～16 | 第二篇 §6～8，含 NIXL 六问 | GDR/GDS/对象路径与 transfer abstraction 的区别；用证据排查一个慢请求 |
| Day 17～21 | 第三篇 §1～5；链 E/F/G | 区分三类远端 KV；沿 1 GiB 冷 Prefix 解释 compatibility、预算、状态、失败与重算风暴 |
| Day 22～23 | 第三篇 §6～7 | 一次限时系统设计；第一轮三张项目卡追问 |
| Day 24～26 | C++ 实验 3 / M0；或按 JD 补最弱项 | 明确“本地协议测试通过”还是“真实 S3 已验证”；不强制完成 M1 |
| Day 27～28 | 链 H + 项目追问 | 新知识回答与真实生产案例分别成立，再说明可迁移部分 |
| Day 29～30 | 随机题、英文口述、投递反馈 | 只补错题；没有证据的经历不写成已完成 |

C++ 实验累计受上表 12/6 小时预算约束，并非每天再加一份任务。环境卡住时先完成无外部依赖的实验 1/2；M0 的真实 S3 验证可以后续补，不把本地 HTTP fixture 当成已跑过 S3。

<a id="jd-focus"></a>

## 5. 按 JD 决定最后一周，不同时准备四种岗位

这是职责映射，不是招聘趋势判断；以拿到的实际 JD 为准。

| 职责强调 | 加深重点 | 可降低优先级 |
|---|---|---|
| Dataset / checkpoint / 对象读写吞吐 | 第一篇 §2；第二篇 §7～8；已有迁移、恢复和故障案例 | 高级 KV policy、完整推理引擎集成 |
| KV serving / prefix reuse | 第一篇 §3～7；第三篇容量、调度、失效 | verbs 建链参数、CUDA kernel |
| 冷 KV + S3 + GPU 路径 | 三篇贯穿案例、闭卷链 H、M0 范围校验 | 泛训练平台和完整模型源码 |
| C++ / RDMA / GPU data movement | 第二篇 ownership、Stream/Event、MR/QP/CQ；可运行 C++ 实验 | 更多模型架构与复杂冷层策略 |

若 JD 明确要求现代 C++ 现场编码或真实 CUDA/verbs 调试，本教程的短实验不能替代专项能力。把差距写清，按匹配程度投递，不靠给 Demo 改名字掩盖缺口。

## 6. 项目、实验、设计三类证据

| 类型 | 可以讲 | 不可以讲 |
|---|---|---|
| ECS/ObjectScale 真实工作 | 本人设计/代码、日志与状态证据、验证结果 | 未参与的底层实现、未经核对的性能数字 |
| C++ 练习与 M0 | 实际编译与测试记录；真实 endpoint 验证结果（若已做） | 仅本地测试就宣称 S3/GPU/RDMA 已落地 |
| M1 或系统设计 | 明确假设下的状态机、故障推演、模拟测试（若已做） | 把模拟时间当硬件性能或生产收益 |

项目深挖入口：[三条项目追问链]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#ecs-project-drills)。优先用你已经整理的私有材料准备，不把内部 DT 字段、公司代码、客户信息搬到公开网站。

[A/B/C 实验证据规格]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-demo-experiments)分别练恢复/重算交点、有界异步流水、失败后安全回收。A 可先跑教学计算；B/C 未实现时只说设计，不能勾选实验通过。选择做它们时替换现有动手预算，M1 仍为可选；C++ 主数据路径、Python workload/benchmark、Go 可选控制面/telemetry 的边界保持。

## 7. 一轮之后如何判断是否还要补内容

先完成[每周 Gate 与错题复测]({{ site.baseurl }}/docs/00_Interview_Drills/#weekly-gates)。不会的题按“概念、方向、单位、生命周期、完成条件、证据”归因；连续两次达到 2 分再移出错题表。

能算、能画、能在条件改变后重做判断，就把时间转向投递和项目问答。新增内容只响应真实卡点或 JD 高频缺口，不因为看见一个新名词就扩写一章。
