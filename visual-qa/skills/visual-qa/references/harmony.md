# Harmony 原生实现与验收

## 实现页面

在当前 ArkUI 项目按既有 ArkTS、组件、路由、资源和状态管理约定落地。先读目标模块的构建配置与页面规范，使用项目实际支持的 SDK/API；Pixso 生成工具不支持 ArkUI 时，读取设计信息后自行实现 ArkUI，不强行调用不支持的目标框架。复用本地组件前确认它是当前 ArkUI 项目可用的组件。

图片节点保留为图片，资源进入项目约定位置。设计坐标、ArkUI vp/fp 和截图物理 px 不是同一种单位；根据当前设备密度、字体缩放及内容区尺寸确定映射并记录。不要直接把设计像素当作设备像素，也不通过拉伸验收图片修正布局。

构建、安装、运行使用已检查的项目命令与用户授权范围。不猜测签名配置或安装产物。不编造业务接口成功状态。CLI 只提供已安装 Ability 的启动与截图；构建安装和复杂导航由 agent 结合项目完成。

## 检测设备与选择操作方式

从目标项目运行（所有占位路径替换成真实路径）：

```bash
node "<插件根目录>/scripts/run.mjs" harmony-devices
```

hdc 不在 PATH 时传 `--hdc-path "<SDK>/toolchains/hdc"`，并在用例中配置同一 `harmony.hdcPath`。命令列出目标并探测 shell 可用性，附带能获取的 model/deviceType。`kind: unknown` 表示没有可靠的真机/模拟器分类证据；不得根据 USB/TCP 或 phone 字样推断。需要真机限定时由已确认的设备信息选定 ID，未知设备不能算真机验收。

- 用户已指定设备：设置 `deviceId`，不可用就报告原因，不自动换设备。
- 只有一个可用目标：可以使用 `auto`；多个目标要求选择 ID。
- 没有可用目标：可使用用户已提供的截图，明确设置 `screenshot`。没有截图时报告缺少设备/截图，不生成验收基准。

只在需要页面操作时检查当前 Computer Use 工具是否可调用，并通过其支持的接口查找投屏或模拟器窗口。CLI 无法探测 agent 的工具清单，`computerUse: checked-by-agent` 不是可用性承诺。确认窗口对应所选设备后，按工具实际返回的界面点击、滑动，进入目标页面。没有工具或可控制窗口时改为手动准备，不要求安装插件。不要用投屏窗口截图替代设备原始截图。

## 准备与验收

从 [设备用例](../../../cases/harmony.example.json) 或 [导入用例](../../../cases/harmony-import.example.json) 复制到目标项目验收目录，设置 `designImage`、输出路径和 Harmony 配置。这里沿用已有 `designImage` 字段，不使用 `referenceImage`。原生用例不填 URL、viewport、DOM 契约、CSS/structure/wait；它们会被拒绝，避免静默丢弃检查。

导航分三种：

- `manual`：用户手动进入目标页面，并确认当前状态已准备好。
- `computer-use`：agent 实际操作并确认目标页面已准备好；此值本身不会启动工具。
- `configured`：CLI 每次通过 `aa start` 启动指定 `bundleName`、`abilityName`。仅用于该 Ability 启动后就是目标页面的场景；深层页面先在 CLI 外完成导航，再选择 manual/computer-use，避免验收时重新启动覆盖目标状态。

manual/computer-use 的每轮设备采集需要 `--page-ready`。它是本轮页面准备已完成的声明；不得只为消除报错添加。用户已完成准备或 agent 已确认页面就绪时，不重复索要确认。configured 启动只证明启动成功，连续稳定画面不证明业务内容正确。

```bash
node "<插件根目录>/scripts/run.mjs" verify --case "<项目>/visual-qa/harmony.json" --page-ready --mode agent
node "<插件根目录>/scripts/run.mjs" verify --case "<项目>/visual-qa/harmony.json" --page-ready --mode final
```

CLI 通过设备 `uitest screenCap` 获取 PNG，再拉取到本地；仅清理本轮生成的设备临时图。默认在 15 秒截图窗口内获得两张间隔 500ms、内容区像素完全相同的截图。持续动画或状态栏时钟可能使其失败：准备稳定的测试状态，或在设计确实仅覆盖内容区时配置 region；不能屏蔽业务差异或放宽阈值换取通过。

裁切坐标为设备原始像素，必须在图片范围内。原图保留，裁切图必须与设计 PNG 尺寸一致；CLI 不自动缩放。导入 PNG 不检测设备、不操作页面、不检查稳定性，只代表该图片的视觉对比。

读取报告与 diagnosticCrops，按差异修正 ArkUI，重新构建、运行、准备页面并再次验收。只有 visual passed 代表截图比较通过；DOM/CSS 为不适用，原生结构/组件测量未实现，字体、图片资源、运行时日志未检查。即使像素完全相同，也不声称完整原生功能或结构验收通过。

每轮生成独立 capture 目录，报告位于 outputDir/report.json。设备状态和导入图片每次重新读取，原生流程不复用 verification 缓存，也不支持 changed-only。最终交付包含页面实现位置、设备 ID（类型未知时说明）、操作方式、验收范围、比较指标和原图/差异证据路径。环境或截图错误先解决对应 failure.stage，不能把旧证据当成本轮结果。
