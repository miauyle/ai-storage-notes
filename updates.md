---
layout: page
title: 全部更新
description: AI Storage 面试教程的内容更新归档。每条链接指向当前版本中对应的章节。
permalink: /updates/
---

这里记录已发布的**教程内容更新**，按北京时间排列。每条链接指向当前教程的对应位置；旧章节可能已被后来修订。站点样式、按钮和构建修复不计入内容更新。

## 2026-10-03 · Inference Storage 技术栈与面试收口

- **职责与场景：**补入[Modern KV Infrastructure Stack]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#modern-kv-stack)，区分 runtime、connector、KV management、transfer 与 backend；[P/D Transfer、Shared KV Cache、Object Storage Tier]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#remote-kv-scenarios)分别判断。
- **NIXL 与兼容性：**[NIXL 六问]({{ site.baseurl }}/docs/02_GPU_Data_Path/#nixl-interview)提升为 SHOULD KNOW，学习指南与训练链同步；[Compatibility Contract]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-compatibility-contract)区分 identity、representation、runtime，并标清 vLLM 当前产品事实与教学原则。
- **cuObject 校准：**按官方 overview、client/server release notes 与 API 更新[双端版本、GET/PUT 方向与完成边界]({{ site.baseurl }}/docs/02_GPU_Data_Path/#chapter-7)，不把 S3 over RDMA 讲成 HTTP 协议替换。
- **可验证证据与排障：**[A/B/C 实验规格]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-demo-experiments)定义恢复/重算交点、有界异步流水与六类失败注入；[排障矩阵]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#inference-troubleshooting)以日志、状态、路径指标和实验闭合证据。实验设计与已有代码验证分别标记，未冒充已跑 GPU/RDMA。

## 2026-09-26 · 从阅读到动手：使用指南、C++ 实验与项目追问

- **网站使用指南：**新增[90/60 小时预算与 30 天安排]({{ site.baseurl }}/docs/00_Study_Guide/#time-budget)，把原先 README 中的学习安排带到网站；实验替换部分阅读，不额外叠加任务。
- **可运行 C++ 实验：**新增[ownership、异步生命周期、ASan 错误定位与 Range GET]({{ site.baseurl }}/docs/04_CPP_Labs/)，提供完整代码、CMake/CTest、预期结果和修改任务。本地 HTTP 契约测试与真实 S3/GPU 验证严格区分。
- **已有项目深挖：**新增[复制、在线迁移和 CRR 三条追问链]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#ecs-project-drills)，对照本人设计/代码、状态证据和验证，不预设内部实现。
- **阶段验收与阅读减负：**明确[入门切片、M0、M1 分别交付什么]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#demo-stage-acceptance)，三篇正文新增第一遍阅读导航，[训练册]({{ site.baseurl }}/docs/00_Interview_Drills/#weekly-gates)补充项目与动手 Gate。

## 2026-09-25 · 按 ECS/ObjectScale 经历校准前置与 C++ Demo

- **已有经验与学习前置：**[ECS chunk replication、在线迁移、ObjectScale CRR 与冷 KV 的边界]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#ecs-to-ai-storage)；Java 功能开发与 Go telemetry 的职责单独写清，不预设对象放置或 GPU 实现经验。
- **对象服务端前台读取：**[Range GET 从对象定位、后端读取到 host buffer 的教学路径]({{ site.baseurl }}/docs/02_GPU_Data_Path/#s3-server-read-prereq)，与异步复制/后台迁移作区别。
- **面试项目证据：**[三张 ECS/ObjectScale 项目卡]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#ecs-project-cards)，以本人代码、日志/chunk 状态和实际验证填写，不用团队成果或未经公开许可的数据冒充个人成果。
- **C++ Demo：**[C++17/20 + CMake 的实现范围]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#cpp-demo-scope)和[真实 S3→host Range GET 基线]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#cpp-s3-probe)；模拟 RDMA 故障与真实 GPU/RDMA 性能分别标注。

## 2026-09-25 · KV Cache × S3 over RDMA × GPU Data Path 贯穿案例

- **冷 Prefix 的存储决策：**[如何区分活跃 Decode、P/D 即时交接与 S3 冷层复用]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#kv-cold-prefix-decision)，比较恢复与重算的完整代价。
- **S3→GPU 数据路径：**[一次冷 KV Range GET 到 GPU Ready]({{ site.baseurl }}/docs/02_GPU_Data_Path/#s3-range-get-gpu-ready)，涵盖服务端读取/EC、TCP→Host→GPU 与双方支持时的 RDMA→GPU 路径、buffer 生命周期、校验和设备可见。
- **系统设计与项目表达：**[1 GiB 冷 Prefix 恢复请求]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-cold-prefix-request)、[ECS/ObjectScale 经验如何回答追问]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#ecs-objectscale-experience)、[真实 S3→Host Range GET probe 规格]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#s3-host-probe)。
- **配套训练：**[闭卷链 H：冷 KV 怎样经 S3 进入 GPU]({{ site.baseurl }}/docs/00_Interview_Drills/#cold-kv-drill)。

## 2026-09-23 · 闭卷训练与来源台账

- **闭卷训练册：**新增 [Day 0 诊断]({{ site.baseurl }}/docs/00_Interview_Drills/#day0-diagnosis)、[按知识链组织的连续追问]({{ site.baseurl }}/docs/00_Interview_Drills/#drill-chains)、随机算题、英文口述和错题复测；9 月 25 日又补入链 H。
- **技术证据：**新增[技术来源与版本台账]({{ site.baseurl }}/SOURCES.html)，集中说明高变化技术的引用边界和实验环境记录方法。

## 2026-09-20 · 主教程补深

- **KV Cache：**增加 [6K Prefix 命中与 TTFT 算例]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#kv-prefix-hit-ttft)、[增长后 OOM 的容量推导]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#kv-capacity-growth)、[block table 共享与回收]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#kv-block-lifecycle)、[恢复与重算的带宽临界判断]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/#kv-restore-recompute-budget)。
- **GPU Data Path：**增加 [C++ 异步 buffer 生命周期代码题]({{ site.baseurl }}/docs/02_GPU_Data_Path/#gpu-buffer-lifetime)、[双缓冲时间轴]({{ site.baseurl }}/docs/02_GPU_Data_Path/#gpu-double-buffer)、[verbs 工作过程]({{ site.baseurl }}/docs/02_GPU_Data_Path/#rdma-verbs-lifecycle)、[GPU 内 KV 布局转换]({{ site.baseurl }}/docs/02_GPU_Data_Path/#gpu-kv-layout)、[性能证据追问]({{ site.baseurl }}/docs/02_GPU_Data_Path/#gpu-path-performance)。
- **系统设计：**增加 [可计算的部署规模]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-system-capacity)、[目录粒度]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-directory-granularity)、[重算风暴预算]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-recompute-storm)、[故障反例]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-system-diagnostics)与[最小可讲 Demo 实验]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/#kv-demo-experiments)。

## 2026-09-20 · 三篇主教程首次发布

- [AI Storage 与 KV Cache]({{ site.baseurl }}/docs/01_AI_Storage_KV_Cache/)：LLM 工作负载、KV 容量、分页、复用与冷层取舍。
- [GPU Data Path]({{ site.baseurl }}/docs/02_GPU_Data_Path/)：CUDA 数据搬运、RDMA、GPUDirect 与 S3 对象路径。
- [系统设计与面试指南]({{ site.baseurl }}/docs/03_System_Design_Interview_Demo/)：KV 分层系统设计、失败处理、性能模型和 Demo 规格。

---

[返回首页]({{ site.baseurl }}/)
