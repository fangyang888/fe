# Pixso 2:179511 视觉用例

设计来源：[画板 1105](https://pixso.cn/app/design/qywt_bYlzqjdJdNrHVnluA?item-id=2:179511&editMode=coder)，大小为 375 × 106。`design.png` 由当前 Pixso 文件中该节点导出，仅用于视觉基准。实现保留按钮文字为可访问的 HTML 文本，并用 CSS 绘制按钮与底部 Home 指示条；此用例没有声明必须整图导出的区域。

2026-10-27 使用独立 Python 引擎重新验收：`final passed`，像素差异 0.4704%，SSIM 0.9916（scikit-image）。迁移前 SSIM 为 0.9969（ssim.js），两者算法不同。按钮仅用于视觉状态展示，没有接入业务行为。运行方法见项目根目录 [README](../../README.md)。
