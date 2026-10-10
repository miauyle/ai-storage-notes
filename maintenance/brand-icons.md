# 站点图标维护

四站使用相同的生成器、head 模板与验证方法；图案由各站 `_config.yml` 的 `docsteer.favicon` 决定。
SVG 是唯一图案源，每次 Jekyll 构建自动生成 32px、192px PNG favicon 与 180px Apple Touch 图标；不提交或手改生成文件。
静态浏览器图标采用默认配色，导航 `docsteer.logo` 保持透明 SVG + 主题渐变背景。
所有图标和 Logo URL 自动带各自内容的 SHA-256 hash，路径由 `relative_url` 加上项目 baseurl。
换图时修改原 SVG 即可，不需要改文件名或手动改版本号。

首次本地构建先运行 `python3 -m pip install cairosvg==2.8.2`（需要系统 Cairo 库），再执行原有资源准备与 `bundle exec jekyll build`。
CI 安装同一版本。`_includes/head.html` 以 DocSteer 1.1.1 为基准，仅替换 favicon 声明；升级主题时核对该覆盖模板。
浏览器验证共享 `maintenance/check_brand_icons.cjs`，覆盖首页、完整目录与正文、资源可加载、尺寸及 hash。
移动浏览器自身标签列表的图标选择不能通过页面 DOM 验证，最终需真机核验。

## 动态标签页图标

四站共用 `assets/js/favicon-accent.js`。从配置的 SVG 中读取 `data-theme-color="brand"` / `accent` 渐变标记，将主题实际计算的 `--brand` / `--accent` 写入副本并生成 64px PNG。图案不变、不重复维护主题配色。
页面加载、skin/mode 变化、系统深浅色变化及返回页面时同步；成功后启用唯一动态 `rel=icon`，静态 favicon 暂以 `media="not all"` 留作回退。无 JS、源图不可用或 Canvas 失败时仍使用原静态图标。Apple Touch 图标及静态 hash URL 不被运行时修改。
浏览器可选择不立即刷新标签页图标；收藏夹、历史记录、iOS 主屏幕图标不保证随页面主题动态更新。移动端真机仍需人工确认浏览器 UI，Playwright 验证的是页面声明和生成图像。
`maintenance/check_dynamic_favicon.cjs` 集成于现有 Chromium 校验，覆盖全部 skin、PNG 背景像素变化、刷新/跨页持久化、mode/系统主题、快速切换、失败与无 JS 回退。
