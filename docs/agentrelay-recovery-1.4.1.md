# AgentRelay 连接与重试恢复 · 1.4.1

2026-11-17，在原目录与 feature/chrome-webstore-listing 上增量修复。截图报告的“上一条请求待确认”对应本地待办 157e5d4a-03ba-47eb-ae86-cb04179ee1a5。服务此时已在线，公开查询返回 status=unknown、error=codex_error、message=Codex turn failed、原生 turnId。AgentRelay 源码的 Codex 后端只在已结束的原生 failed/interrupted 轮次抛出对应精确错误。插件此前将此类明确终态一直当作未知，留下会话占用，后续批次重试持续阻塞。

修复将该带 turnId 的精确原生终态转为失败并释放本地占用。其他未知、超时或响应丢失继续保留原任务查询。请求提交前检测服务身份，离线时直接显示连接错误，不创建待办占用。查询期间离线会保留原收据，启动服务后可继续查询。重试清除旧错误状态，成功恢复后清理旧收据引用。

定向 tests/relay-recovery.test.cjs 使用隔离浏览器存储与模拟服务，覆盖离线启动后重试、旧原生失败释放、真正未知仍阻塞和提交响应丢失时同任务不重发。tests/post-batch.test.cjs 验证查询恢复、少项重试、原文恢复和减少动画。五语言字典检查通过。

9222 中原扩展 peaggfbpdbpofbohencpdabfaogcpdcb 已从原路径重载为 1.4.1。新建测试标签打开真实 https://x.com/grok，3 条帖子完成中文翻译，未出现旧阻塞。后查旧本地记录 status=failed、error=relayFailed。只关闭验收创建的标签。用户原有页面需刷新以加载新内容脚本。截图本机保留于 C:/jtmp/xct-recovery-loading.png 与 C:/jtmp/xct-recovery-success.png，含真实账号界面，不加入公开素材。

包 release/X-Chat-Translator-1.4.1.zip，SHA-256 67a9b0be4fb43f92ca671c1b0082ee974a930f06850c88f5b0baf128db624dda。本次仅本机修复与加载，商店此前 1.4.0 审核未操作。
