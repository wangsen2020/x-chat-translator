# Chrome Web Store 列表封面

2026-11-07。Small promo tile，440×280 JPEG，五语言 en、zh_CN、es_419、ja、ko。list-* 是 275×175 列表缩略检查图，small-* 是上传原图。contact.jpg 为全语种预览。

使用内置 image_gen 生成背景，浏览器 HTML 排版文字，保持本地化可编辑。scene.png 为原始生成背景。生成提示如下。

Create a premium dark editorial background for a Chrome extension promotional tile, landscape ratio 11:7. No text, no letters, no logos, no UI, no symbols. Near-black graphite matte surface, restrained brushed-metal texture with very fine film grain. A subtle sculptural folded ribbon of smoked glass and platinum across the far right edge and lower-right corner, just a tiny electric mint light rim. Main left two thirds completely calm, nearly black for large white typography, excellent contrast. Professional high-end software campaign, tactile light and shadow, refined dimensional depth, no neon blue or purple gradients, no star fields, no busy geometric patterns. Keep ornaments subordinate so 440x280 typography will be legible.

品牌与原文/译文展示采用示例数据。宣传卡是译文预览的示意排版。实际界面截图保留在 store/screenshot-* 文件。

渲染命令为 node tools/render-promo.cjs，需要 playwright、sharp 和已有 9222 CDP。脚本只创建并关闭自己的测试标签。已实际查看五语言原尺寸、英语及中文列表缩略图，中文标题间距调整后复验。JPEG 为 RGB，无 alpha。

本轮仅更新商店图像素材，软件版本维持 1.1.1。当前工作仍在 feature/chrome-webstore-listing，未进行 Git 提交。开发者后台要求重新验证身份，本轮封面尚未上传商店。

## 上传更新

2026-11-07，用户完成 Google 验证后继续。控制台 Small promo tile 属于 Global assets，五语言共用一个封面位置。采用 small-en.jpg 作为全球封面，切换中文并重新打开条目后仍为同一云端图，确认设置已保存。其他四语言成品保留在本目录。

远端原图下载后确认为 440×280，与 small-en.jpg 的平均像素差为 0，证据见 upload-verification.json。素材更新已提交审核，状态页实际显示 Pending review / This draft is pending review。提交确认框的审核通过后自动发布保持选中。
