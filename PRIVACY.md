# XTrans Privacy / 隐私说明

Updated / 更新日期：2026-11-26

XTrans translates text on X (Twitter): posts, article-detail blocks, reply/quote drafts and incoming/outgoing DMs. Each of these five scenarios can use Google Translate, your Gemini API key, or an existing AI conversation through your separately installed AgentRelay service. Article text is collected only when a block enters the viewport; the extension does not submit an entire article in advance. “Skip my language” avoids translation requests for matching reading content or drafts already in their target language.

The relevant text and target language are sent to the selected service. Google uses `translate.googleapis.com`; Gemini uses `generativelanguage.googleapis.com`. AgentRelay passes explicit tasks to the selected AI conversation over a user-approved local connection. Local connection does not imply offline inference: providers may process text in the cloud and retain conversation history under their own policies.

XTrans has no developer-operated data server, analytics or advertising tracking. Preferences and per-chat sending languages are saved in `chrome.storage.local`; chat keys include the X chat path. Service credentials, Gemini keys and conversation bindings are stored locally in the extension origin, used only for the configured service, and are not submitted to the GoodExts website.

Completed translations use a bounded local IndexedDB cache of up to 4,096 segments, with separate article keys and oldest-slot replacement. Keys are SHA-256 digests of the service/context, category, target language and source. Completed entries contain translations, without readable source text, credentials or account names. Page memory also caches results. Some AI DM paths use this cache or task recovery records. Data is not synced to other devices; uninstalling removes extension-local data.

Before an AgentRelay task is sent, a temporary recovery record stores the source, task receipt and necessary credential snapshot so the original task can be queried after interruption. Completion clears the request body and token snapshot; results expire after about 10 minutes. Unconfirmed records are retained for at most about 24 hours, with cleanup on the next extension run if the browser was closed. These records are separate from completed translation caches.

Reply/quote previews retain the original draft. With interception enabled, direct user clicks or Enter can submit the reviewed translation. Programmatic publishing clicks, including XFollower quotes, retain the original request text. Disabling a feature stops new translation requests; it cannot recall sent requests or delete posts/messages already in X. Check X before retrying an unconfirmed sending result.

Permissions: `storage` saves settings; `alarms` resumes and cleans up original tasks; X content scripts read supported text and add translation UI. Google host access requests translations. Optional Gemini host access, loopback-host access and `nativeMessaging` are requested as needed for the configured API/local service, including native discovery and local connection exchange. Cookies, browsing history and arbitrary website access are not requested. Executable code ships in the package; translation responses are data, never executed remote code.

Do not automatically translate content you do not want to share with the selected provider. Third-party retention is outside this extension's control. XTrans is independent of X, Google and the supported AI providers.

## 中文说明

XTrans 翻译 X（Twitter）的帖子、文章详情正文块、回复/引用评论草稿，以及收到和发送的私信。五场景可独立选择 Google 翻译、自己的 Gemini API 密钥，或通过单独安装的 AgentRelay 连接已有 AI 会话。文章仅在正文块进入视口后采集，不提前发送整篇；「母语不翻译」会跳过已匹配阅读语言的内容和已是目标语言的草稿。

待翻译文字和目标语言发送至所选服务。Google 使用 `translate.googleapis.com`，Gemini 使用 `generativelanguage.googleapis.com`；AgentRelay 将显式任务交给所选 AI 会话。本机连接不等于离线推理，服务商可能在云端处理并按自身政策保留会话历史。

插件没有开发者自营数据服务器、统计分析或广告追踪。偏好和每个聊天的发送语言保存在 `chrome.storage.local`，会话键包含 X 聊天路径。服务凭据、Gemini 密钥和会话绑定保存在扩展本地，仅用于所配置服务，不提交给 GoodExts 官网。

已完成译文使用有界 IndexedDB 缓存，最多 4,096 段，文章类别单独隔离，满后替换旧槽位。缓存键由服务/上下文、类别、目标语言和原文生成 SHA-256 摘要；已完成条目只保存译文，不保存可读原文、凭据或账号名。页面内存也缓存结果，部分私信 AI 路径可能使用此缓存或任务恢复记录。不跨设备同步，卸载扩展会清除本地数据。

AgentRelay 发送前临时保存原文、收据及必要凭据快照，以便中断后查询原任务。终态清除请求正文和令牌快照，结果约 10 分钟过期，未确认记录最多保留约 24 小时；浏览器关闭期间到期的数据下次运行清理。恢复记录与已完成缓存分开管理。

回复和引用评论保留原稿，开启拦截时，人工点击或 Enter 可发送核对后的译文；XFollower 等程序点击发布按钮时保留原请求正文。关闭功能停止新增翻译请求，不能撤回已发送请求或删除 X 上已有内容。结果未知时先检查 X，再决定是否重试。

`storage` 保存设置，`alarms` 恢复和清理原任务；X 内容脚本读取支持的文字并添加界面，Google 域名权限用于请求译文。Gemini 域名、本机回环地址及 `nativeMessaging` 按配置需要申请，用于 API、本地宿主发现及连接信息交换。不请求 cookies、浏览历史或任意站点权限。可执行代码随包提供，翻译结果只作数据，不执行远程代码。

请勿自动翻译不愿提供给所选服务商的内容，本插件无法控制第三方保留策略。XTrans 不是 X、Google 或相关 AI 服务商的官方产品。
