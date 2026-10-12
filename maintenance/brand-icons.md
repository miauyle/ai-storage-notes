# 站点图标维护

四站复用相同脚本、构建器与验证逻辑，图案来自各站 docsteer.favicon 的 SVG。
Logo 保持透明 SVG + CSS 渐变。静态资源、动态图标脚本、页面导航脚本均使用内容 hash。

## 构建

执行 Jekyll 后，运行 maintenance/build_theme_icons.cjs /<baseurl>。
构建器从主题实际控件与编译 CSS 读取全部 skin / light / dark 的 --brand / --accent。
render_theme_icons.py 从同一 SVG 生成 64px favicon 与 180px Apple Touch PNG，文件名由图片 SHA-256 决定。
build_theme_pages.cjs 为首页、目录及全部正文生成 /theme/<skin>/<light|dark>/... HTML；正文源不复制。
电脑与 Android Chrome 继续使用原地址和 favicon-accent.js 的动态 PNG 切换；Android 标签栏即时更新尚未实机验证。

## Safari 与 iPhone Chrome 页面加载行为

普通地址读取已保存的 docsteer-skin / docsteer-mode，真正跳转到对应配色 HTML。
该 HTML 直接声明唯一 PNG favicon 和 Apple Touch 图标，明确设置 skin / mode，不运行动态图标脚本。
切色时只保存设置、更新本站文档链接，不改当前 URL、不强制刷新、不修改当前静态图标。
手动刷新旧配色页面时，按保存的主题跳转一次；跨页链接直接进入新配色页面。
配色路由守卫在字符集声明后、图标候选前执行；需要跳转时停止旧文档解析，再加载正确配色，避免旧候选抢先被声明。
四站共享同源主题设置；被动变色不强制刷新。后台页面重新可见或获得焦点时重新读取设置，手动刷新后选择对应静态页面。
搜索新建链接、页内锚点、Sidebar、Previous / Next、Logo 和完整目录保持对应路由。
无 JS 时原地址保留默认静态图标；配色地址保留固定图标、模式与静态导航。
Safari 和 UA 含 CriOS 的 iOS Chrome 共用此流程。其他浏览器打开配色分享地址时回到普通地址。
下载、跨站链接和资源路径不重写。iPhone Chrome 的当前实测效果是重新加载时更新图标，不承诺切色时标签栏即时更新。

## 索引与维护边界

配色副本保留原 canonical / og:url 并声明 noindex,nofollow，不进入搜索或 sitemap。
资源只生成一份，新增产物仅为 HTML 和轻量路由元数据。普通入口、Edit this page 和知识导航源不变。
移除旧的 Safari document.write、无效 rel / noscript 竞争候选补丁，以及 A/B 与两篇文档试验生成器。
PNG/hash 基础设施继续服务 Chrome 与静态页面，不属于被移除的 Safari 动态补丁。
不保证收藏、历史或已有主屏幕快捷方式实时更新，不清理用户浏览器缓存。

## 验证

Chromium 保留全部动态配色、PNG 像素、hash、刷新、跨页、明暗模式与失败回退回归。
WebKit 使用手机/桌面 Safari 与 iPhone Chrome UA 验证全部配色页面、刷新、真实跨页、主题保存和动态搜索链接；静态页面另验证无 JS。
同时验证电脑与 Android Chrome UA 仍回到普通地址、保留动态图标分支，Android UA 的资源/DOM 回归不代表 Android 真机结果。
自动检查的是页面、资源和导航，不是浏览器标签栏。真实 Safari 标签栏的静态方案已由用户在试点确认，iPhone Chrome 接入后仍需实机抽查。
同源双项目路径回归覆盖 A 主动切色、B 被动切色、两侧刷新、B 重复刷新、明暗模式、query/hash 保留及模拟遗漏 storage 事件后的焦点恢复。
