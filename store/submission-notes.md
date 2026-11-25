最新状态见 ../docs/i18n-1.1.0.md：商店草稿已更新为 1.1.0，五语言资料与截图已保存。以下保留首次 1.0.1 准备记录。

# Chrome Web Store 首次上架准备

2026-11-04；候选包：现有正式版 1.0.1，不修改软件版本或覆盖 GitHub Release。

## 当前边界

- 已复用 9222 XFollower CDP 的 wangsen2021@gmail.com 开发者账号；已创建并上传商品 dlijcpgpcmbnenmhpgijjhlhedhkmbmk，状态 Draft。
- 按用户授权已将仓库改为 Public。隐私链接：https://github.com/wangsen2020/x-chat-translator/blob/master/PRIVACY.md（HTTP 200）。GoodExts 通用隐私页要求各扩展使用独立政策，因此复用现有插件政策。
- 仅准备简体中文商店介绍；现有包无 _locales，界面为中文，不声称支持多语言界面。
- 官网 https://goodexts.com，支持 https://goodexts.com/contact-us；Official URL 使用已验证 goodexts.com。未新增网站下载，网站下载同步不适用。
- 发布 skill 要求最后三项数据使用承诺由用户本人勾选，最终审核提交须遵循该步骤。
- 现有 ZIP SHA-256 为 `18901dbf0677c0b3024e6cddf70f4855d46510e1581a152fc79e11f70da7aff5`，与 GitHub 1.0.1 Release 附件摘要一致。
- 已准备并实际查看 1280×800 聊天与帖子截图（同目录 JPG）；使用真实 content.js/posts.js 与模拟数据，不含用户资料。另查看 960×800、640×800（等效半宽）聊天展示；修复了展示模板盒模型导致的发送按钮裁切和窄屏标题遮挡。此为素材验收，不冒充已安装扩展的完整验收。
- 源码版本与发布 ZIP 未修改；新增 store 文档/素材不参与安装包。素材未提交 Git；安装包与图标及两张截图已上传商店，尚未提交审核。

## 权限与数据说明草案

单一用途：在 X 网页内提供帖子和私信的文字翻译，帮助跨语言阅读与交流。

storage：保存目标语言、翻译开关、面板展开状态及每个会话的发送语言。不会把消息正文或译文写入持久化存储。

主机权限：x.com 的内容脚本读取适配正文并插入译文/预览；translate.googleapis.com 用于把待翻译文字发送给 Google Translate 并取得译文。

远程代码：不使用。扩展 JavaScript 随包提供；网络响应是翻译文本，不执行远程脚本。

数据类型：应如实披露个人通信（私信/草稿）和网站内容（帖子文本）会传给翻译服务；不得填写“不收集或传输任何数据”。最终按控制台实际字段和公开隐私说明核对。

## 搜索用词证据

本次保留既有功能性名称 X Chat Translator 与中文摘要，不将下列词宣称为已验证流量机会。

| 市场/候选 | 实际查询 | 证据 | 结论 |
| --- | --- | --- | --- |
| 中文：X 双语翻译、聊天翻译 | site:chromewebstore.google.com 推特 翻译 聊天 双语 | https://chromewebstore.google.com/detail/x-%E5%8F%8C%E8%AF%AD%E5%AF%B9%E7%85%A7%E7%BF%BB%E8%AF%91/gadokhdbijkbnkchennmbembffdliopc | 有同类功能商品；无搜索量、趋势或增长数据，需求规模未验证 |
| 英文：X / Twitter chat translator | site:chromewebstore.google.com X Twitter chat translator | https://chromewebstore.google.com/detail/twitter-x-auto-translator/lhjmkdamjpjikhmkllpldfchkngnjkdl | 搜索结果用途相关；不用于本次新增英文商店语言 |

未取得 Semrush/Similarweb 或 Trends 报告，不能声称关键词增长、竞争低或有付费需求。以准确功能说明完成当前介绍。

## 控制台填写与回读

- 中文描述 658 字，Communication 分类，Chinese (China) 语言。
- Privacy：单一用途、storage 与主机权限说明已保存；远程代码 No；数据类型仅 Personal communications 和 Website content。三项最终承诺留给用户勾选。
- Distribution：免费、公开、所有地区。
- Package：Draft 1.0.1，未发布。
- Test instructions：已拟定自有 X 测试账号步骤，但独立页面保存后回读为空，未确认保存；无提交前必填错误，未填写真实账号凭据。
- 发布 skill 要求用户本人完成三项最终承诺和审核提交；当前不代表已上架。


- 最终回读：Official URL goodexts.com、描述 658 字、分类和语言均已持久保存。Why cannot I submit 只列数据使用三项承诺未认证。


