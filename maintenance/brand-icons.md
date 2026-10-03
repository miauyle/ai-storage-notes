# 站点图标维护

四站使用相同的生成器、head 模板与验证方法；图案由各站 `_config.yml` 的 `docsteer.favicon` 决定。
SVG 是唯一图案源，每次 Jekyll 构建自动生成 32px、192px PNG favicon 与 180px Apple Touch 图标；不提交或手改生成文件。
浏览器图标采用固定配色，导航 `docsteer.logo` 保持透明 SVG + 主题渐变背景。
所有图标和 Logo URL 自动带各自内容的 SHA-256 hash，路径由 `relative_url` 加上项目 baseurl。
换图时修改原 SVG 即可，不需要改文件名或手动改版本号。

首次本地构建先运行 `python3 -m pip install cairosvg==2.8.2`（需要系统 Cairo 库），再执行原有资源准备与 `bundle exec jekyll build`。
CI 安装同一版本。`_includes/head.html` 以 DocSteer 1.1.1 为基准，仅替换 favicon 声明；升级主题时核对该覆盖模板。
浏览器验证共享 `maintenance/check_brand_icons.cjs`，覆盖首页、完整目录与正文、资源可加载、尺寸及 hash。
移动浏览器自身标签列表的图标选择不能通过页面 DOM 验证，最终需真机核验。
