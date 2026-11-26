# XTrans 1.8.0 验收与发行记录

## 本轮发行补充

以下早期状态按时间保留。本次用户已明确授权 Git Flow 发版、官网部署和 Chrome 商店提交。官网发行目标为 1.32.0，四语产品页及指南已同步文章可见块懒翻译、文章独立缓存和五场景引擎；当前演示图片已替换为 XTrans 1.8.0 新版源码渲染截图，内容与配置均为虚构示例。

五语商店截图、简介和详细描述同步 1.8.0。PRIVACY.md 更新五场景、三引擎、可见块采集和缓存边界。AgentRelay Native Messaging 源码及本机 Chrome / Edge 宿主均包含正式商店 ID 与开发 ID。四语官网 1280 / 640 / 390 px 无溢出和损坏图片；文章、缓存、回复、帖子、语言、设置及 i18n 定向检查通过，没有运行全量回归。发行以 GitHub Release 和商店控制台实际状态为准，商店提交不等于审核通过或已公开。

日期：2026-11-26。插件在 `feature/xtrans-language-quote`，GoodExts 在 `feature/xtrans-positioning` 继续本轮迭代；没有提交、合并、推送或发布。

## 交付范围

- 品牌统一为 XTrans，定位为 X（Twitter）翻译助手，涵盖帖子、回复、引用评论及私信。同步五语扩展文案、商店介绍草稿及四语官网介绍；保留扩展身份、已有设置和 URL。
- 偏好设置新增默认开启的「母语不翻译」，沿用公共 switch 控件。阅读内容按阅读语言判断，回复和引用草稿按目标语言判断。
- 使用 Chrome 本地语言识别；针对中文短句返回 `zh:100%` 但 `isReliable:false` 的实际情况，结合汉字占比判断。假名、韩文或混合语言不套用这一中文短句规则。
- 引用弹窗从真实 `composerData[index].quotedStatus` 获取目标；草稿来自 Draft.js 当前状态，不能依赖会滞后的 `composerData.text`。提交时核对引用目标和当前草稿，保留附件与其他请求字段。
- 发送拦截仅响应人工点击；程序调用 `.click()` 保留原始请求。人工按 Enter 的译文发送仍可用。

## 增量验证

运行并通过：`tests/posts.test.cjs`、`tests/replies.test.cjs`、`tests/language-quote.test.cjs`、`tests/i18n.test.cjs`、`tests/options-engine-ui.test.cjs`。未运行全量测试。

覆盖母语零请求、开关持久化、重新开启后不误用旧译文、中文草稿译成外语、原稿保护、引用目标校验、附件保留、人工译文发送与程序原文发送。通过实际扩展 options 页面检查开关默认值和关闭/开启后的持久化，测试结束恢复原偏好值。

## XFollower 引用发布组合实测

只读使用 `E:/WebstormProjects/x-each-follower/src/platform/x/page-reader.js` 中现行 `publishQuotePostOnPage` 函数，没有修改 XFollower 源码、关注队列或设置。

在当前 CDP Chrome 的新测试标签中打开真实 X 引用弹窗，注入当前 XTrans 源码进行预览验收。测试使用独立桥接事件名及受控翻译回包，避免与已加载旧版内容脚本争用。实际运行 XFollower 的发布函数，提前拦截并中止测试标签内的 CreateTweet 网络请求，然后提供模拟 UI 收据供函数完成。

结果：捕获 1 次原生请求；`tweet_text` 与 XFollower 审定原文逐字相同，未被预览译文替换；`attachment_url` 保持目标引用。程序返回的测试帖子 ID 是模拟收据，并非真实发布。人工发送的译文载荷路径另由回复模块定向测试覆盖。

脚本及截图保留在 `C:/jtmp/xtrans-20261126/`：

- `quote-real-accept.cjs`：真实弹窗与 XFollower 发布函数组合实测。
- `real-quote-preview-wide.png`、`real-quote-preview-narrow.png`：真实弹窗预览，1280 / 500 px。
- `ui-check.cjs`、`preferences-wide.png`、`preferences-narrow.png`：实际扩展偏好设置，1280 / 390 px。
- `site-static-ui.mjs`、`site-*-wide.png`、`site-*-narrow.png`：官网生成产物，四语 1280 / 390 px。

## 版本与边界

源码与本地 ZIP 为 1.8.0。验收时已加载扩展运行清单仍为 1.7.5；options 页面可读取磁盘新脚本，但未重载整个扩展或刷新用户正在工作的 X 页面，不能据此称已加载 1.8.0。

上段是最初验收状态；本轮后续文章验收已安全重载并确认加载 1.8.0，详见下节。

GoodExts 本地生成版本为 1.31.1，四语产品页无横向溢出、无缺失链接 title、无损坏图片，产品页不含操作步骤列表。生产官网核验仍为 1.31.0，未部署。

既有产品演示图片保留历史界面标识，本轮没有把它们声称为 1.8.0 新版截图。旧版商店提交记录与历史发行记录保留原貌。

## 偏好设置样式复验（同轮反馈）

沿用当前 feature 与 1.8.0 候选版本，只调整 `options.html` / `options.css` 的偏好设置分组。设置之间统一 20 px，字段与控件间 8 px，开关标题与说明间 4 px；阅读语言的私信说明移至对应下拉框下方。开关复用公共样式，补齐说明关联，并用独立标签避免屏幕阅读器重复朗读说明。

实际扩展选项页完成中文与英文 1280 / 640 / 390 px 验收，640 px 作为桌面 200% 缩放的等效宽度。下拉框高 30 px、箭头距右侧 10 px；无横向溢出，键盘焦点可见，浅色与深色均可读。开关持久化验收后恢复原值。此轮未修改翻译或 XFollower 发布逻辑。

截图：`C:/jtmp/xtrans-20261126/preferences-polish-panel.png`、`preferences-polish-zh_CN-390.png`、`preferences-polish-en-390.png`、`preferences-polish-focus.png`、`preferences-polish-light.png`。

## 文章分块懒翻译、类别与缓存

文章与帖子复用同一渲染、翻译队列及有界 IndexedDB 缓存，独立归为 `article` 类别。引擎选择增加「文章翻译」一行，旧配置未保存该项时默认继承帖子引擎。Google、Gemini 与 AgentRelay 的文章缓存命名空间与帖子分离；保留旧帖子缓存键，无清库或全量迁移。

只在文章详情路径中的 `twitterArticleReadView` / `twitterArticleRichTextView` 下观察文本 Draft 块。使用 `IntersectionObserver`，`rootMargin: 0px`，相交后再读取当前块文字；不采集整篇容器。媒体节点、媒体内嵌说明、文章卡片和编辑器不进入此流程。异步语言识别或批次等待期间滚走的块延后发送。块内修改、语言或引擎变化、SPA 路由离开和原文切换均有清理与过期结果校验。

定向用例 `tests/article-blocks.test.cjs` 覆盖 220 个未见块零采集、零请求，滚动去重、源块变化、详情路径限定、替换/原文切换、滚走延后，以及 Google 文章类别缓存跨页面重载复用、文章/帖子隔离与零 IndexedDB 扫描。Gemini 用受控网络验证独立文章引擎、缓存分类、缓存复用、旧配置继承及过期 revision 拦截。关联的帖子、批次、缓存、Google worker、聊天共享队列、Relay 恢复、设置和 i18n 增量测试均通过，未运行全量回归。

用户指定的真实页面：`https://x.com/erintwalsh_/status/2125741680427208811`。

先核实扩展无在途 AI 任务、设置页无未保存配置，再重载原扩展 ID `peaggfbpdbpofbohencpdabfaogcpdcb`，实际运行版本 1.8.0。保留所有配置、旧缓存和原文章标签页阅读位置；只在新测试标签中验收。

原生验收脚本 `C:/jtmp/xtrans-20261126/article-native-cache.cjs` 使用真实 Google 服务及扩展 IndexedDB；没有注入测试版本的源码，也没有模拟译文。该页 41 个内容节点中，初始只采集 1 个正文块。首块产生 1 次翻译网络请求；滚动后观察到按块发送的请求长度分别为 439、43、311 字符。直接读取文章类别缓存确认已持久保存；再次打开原页面，首块新增网络请求为 0。临时 fetch 计数包装在测试结束时已恢复。

实机截图：`article-native-wide.png`（1280 px）、`article-native-narrow.png`（500 px）。「文章翻译」场景沿用已有列表控件，在 1280 / 640 / 390 px 检查 5 类场景、默认继承、30 px 下拉框、10 px 箭头距离及无横向溢出。均位于 `C:/jtmp/xtrans-20261126/`。
