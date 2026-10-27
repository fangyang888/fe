# SCSS 重构验收

目标是改善样式维护性并保持修改前页面外观。修改前截图是回归基准，不代表原页面符合设计规范。不要顺手改变设计、主题、选择器、声明顺序、媒体查询或无关页面。

## 范围和变量

先读项目规则、目标模块构建配置、现有变量和主题定义。只变量化实际复用且语义一致的值。组件内部共用值留在组件；跨组件稳定值才提升到共享变量文件。不要合并值相同但用途不同的变量。

主题颜色继续遵守现有 CSS 自定义属性和主题 scope。不要将动态 `var()` 固化为浅色值。尺寸静态值可以使用 Sass 变量。新变量文件只放变量、函数或 mixin，避免重复输出 CSS。

保留工作区已有修改，不通过 reset 或 checkout 制造基准。

## 保存修改前基准

列出受影响的页面、状态和视口，至少覆盖默认状态；选中、禁用、暗黑或其他主题只在真实存在且受影响时加入。

在修改源码前启动真实页面，固定数据、字体、浏览器、视口、DPR、主题和等待条件。使用 Python capture 保存每个状态：

```sh
<qa> capture \
  --url "http://127.0.0.1:3000/example" \
  --output <项目>/artifacts/visual-qa-langgraph/scss-refactor/baseline/default.png \
  --width 375 \
  --height 812 \
  --dpr 1 \
  --browser-channel chrome \
  --selector ".example-page" \
  --compact
```

`capture` 使用与实测相同的资源、字体、布局稳定性和控制台检查。需要完整页面时加 `--full-page`；已有可靠 ready flag 时用 `--ready-expression`。

查看基准并确认状态正确。再保存一份独立临时截图，用相同参数与 baseline 对比，确认动画、字体和网络数据可重复。不能把修改后的截图补作基准。

记录 URL、状态准备步骤、viewport、DPR、浏览器、截图 SHA-256、源码版本和未提交改动说明。没有可靠修改前基准时可以整理源码，但必须报告视觉回归未验证。

## 修改与复验

按要求小范围替换变量，运行目标模块实际的 Sass 编译或构建。再为每个状态创建 case，把 `designImage` 指向该状态的 baseline，把 `outputDir` 指向修改后证据目录：

```sh
<qa> verify --case <项目>/artifacts/visual-qa-langgraph/scss-refactor/default.json --compact
```

每轮重新截图并重新执行资源、字体、控制台、CSS、结构和测量检查。不要复用旧通过结果，也不要放宽阈值让重构过关。

报告变量映射、构建结果、每个状态的视觉指标、截图与报告路径、未验证状态。只有计划覆盖的状态全部 final passed 才能报告本次范围内通过；截图通过不代表全部交互或全部页面通过。
