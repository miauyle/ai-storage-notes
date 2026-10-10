# 站点图标维护

四站共用相同生成器、head 模板、主题切换和验证代码。各站图案由 `docsteer.favicon` 的 SVG 决定，导航 Logo 保持透明 SVG + CSS 主题渐变。
静态 SVG、PNG 与 Logo URL 带内容 SHA-256；favicon 脚本同样自动带内容 hash，不使用手动版本号或每次请求的随机时间戳。

## 发布构建

1. 安装现有站点依赖、`cairosvg==2.8.2` 和 Playwright Chromium。
2. 执行原有 Jekyll production build。
3. `NODE_PATH=<site-deps>/node_modules node maintenance/build_theme_icons.cjs /<project-baseurl>`。
4. 执行原有站点与 Chromium 校验；安装 Playwright WebKit 后运行 `node maintenance/check_webkit_icons.cjs /<project-baseurl>`，最后上传完整 `_site`。

CI 已包含这些步骤。仅执行 Jekyll、不运行步骤 3 时保留默认静态图标，不生成主题变体。
生成器从构建页面的实际 skin 控件及实际编译 CSS 读取每种 light/dark 的 `--brand` / `--accent`，不手写第二份配色表。
`render_theme_icons.py` 修改原 SVG 副本中的 `data-theme-color="brand"` / `accent` 渐变标记，生成 64px favicon 和 180px Apple Touch PNG。
文件名为 `theme-<size>-<PNG内容SHA256前12位>.png`，换颜色或图案即换 URL，同一内容继续复用缓存。
生成文件和逐页注入的配色 manifest 仅存在于构建产物，不提交生成 PNG，不修改知识正文。

## 页面行为与回退

`favicon-accent.js` 是带内容 hash 的非 defer head 脚本：读取已恢复的主题与实际 CSS 颜色，选择 manifest 中的同源 HTTP PNG。
同时替换唯一 `rel=icon` 和 `rel=apple-touch-icon` 节点；静态节点保留作回退但移除 rel，避免多个候选争抢。
skin/mode、系统深浅色、返回页面及重新显示时同步。没有 JS、没有 manifest、未知配色或 PNG 解码失败时仍使用原静态图标。
不再依赖 Canvas 或 `data:` URL 作为浏览器图标。

浏览器标签列表、收藏/历史图标的刷新时机仍由浏览器决定。已安装到 iOS 主屏幕的图标不保证随页面主题自动更新。
Chromium 和移动尺寸 WebKit 检查的是资源、声明、PNG 像素、缓存 hash、刷新/跨页、系统主题及回退；不能等同于 iPhone Safari/Chrome 的真实标签栏 UI 验证。
