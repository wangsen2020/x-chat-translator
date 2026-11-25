# 1.5.0 评论翻译本地验收

日期：2026-11-19。源码与 9222 CDP 当前已加载版本均为 1.5.0，扩展 ID 为 `peaggfbpdbpofbohencpdabfaogcpdcb`，沿用原目录和现有配置。未提交、推送或发行；商店发布状态不变。

## 产品行为

- popup 中评论翻译默认开启；评论目标语言默认跟随被回复帖子的原文语言，浮窗与 popup 可手动覆盖并同步。
- 输入框不替换为译文，译文显示在输入框下方。拦截发送默认开启，Enter 和原生回复按钮发送浮窗译文；关闭拦截后仅预览，键盘与按钮恢复 X 原生处理。
- Shift + Enter 换行、输入法选字不发送。翻译未完成时按 Enter 会等待当前译文；改写草稿、切换对象或关闭开关取消待发送意图。
- 评论复用当前 Google / AgentRelay 引擎和持久缓存。AgentRelay 串行处理本页草稿，持续显示 loading，超过 7 秒保留等待提示。未知翻译任务只查询原任务，未知发布结果阻止重放。

## 定向验证

只运行本模块的 `tests/replies.test.cjs` 和本次新增文案涉及的 `tests/i18n.test.cjs`，未运行全量回归。

评论 fixture 覆盖多行原文保留、fetch / XHR 仅改正文、回复 ID 校验、Enter / 原按钮 / IME / Shift + Enter、开关持久化、输入变化取消待发送、页面去重和持久缓存命中、慢速 AI 与减少动画、未知任务查询和发布结果未知时阻止重复请求。popup 默认开启、自动目标语言及独立设置通过。

## 真实 X / 9222

- 使用既有 AgentRelay 绑定，没有新建会话或修改引擎配置。首轮 AI 返回约 10 秒；重新打开相同草稿时，仅观察到 `XCT_BATCH_LOOKUP`，没有 `XCT_BATCH_START`，约 0.6 秒取得缓存译文。
- 原文“谢谢你的分享，这个方法很有帮助。”保留在原编辑器，浮窗显示 “Thanks for sharing, this method is very helpful.”。
- 详情页 Enter、桌面回复弹窗原按钮、420 px 回复页原按钮均确认：原生 `CreateTweet` 请求正文为浮窗译文，回复 ID 正确，输入框原文未替换。
- 所有真实页面发布测试都在请求发往服务端前于本机拦截，注入失败响应。验证失败反馈与原文保留，没有公开发表评论。真实发布成功后的服务端回执与清空行为尚未进行公开发送验收；成功分支仅在 fixture 验证。
- 浮窗挂载移至原编辑器测量容器之外，修复裁切；实际查看 1440 px、960 px 和 420 px 页面、桌面弹窗、窄屏回复页及 320 px 中文 popup；fixture 补充 360 px 与英文。窄屏状态文案无水平溢出。
- 测试只创建和关闭自己的标签页，清理自身测试草稿；保留用户的页面、输入、配置和其他运行任务。

## 证据与产物

截图、原生请求正文与目标校验结果保存在本机目录：

`C:\Users\Administrator\.codex\outputs\2026-11-19\xct-reply-acceptance`

其中 `live-results.json` 对应详情页 Enter，`live-modal-results.json` 对应桌面和窄屏原按钮。`live-preview-wide.png`、`live-preview-narrow.png`、`live-modal-wide.png`、`live-modal-narrow.png`、`fixture-ai-loading.png` 为相关状态截图。

本地安装包：`release/X-Chat-Translator-1.5.0.zip`。SHA-256：`8a1561f501cb65490d6bc4622f6ac35c2d7c23a658e6d26e5a5d34349b6ebf00`。
