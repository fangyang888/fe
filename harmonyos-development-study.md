# 鸿蒙 HarmonyOS 开发学习笔记

这份笔记适合前端或移动端开发者入门 HarmonyOS 应用开发。重点围绕当前 HarmonyOS NEXT 常见开发方式：ArkTS、ArkUI、Stage 模型、Ability、页面路由、状态管理、网络请求、数据存储、生命周期和性能优化。

如果你有 JavaScript、TypeScript、Vue 或 React 基础，学习鸿蒙开发会更顺，因为 ArkUI 的声明式 UI 思路和现代前端框架很像。

## 目录

- [先建立整体认知](#先建立整体认知)
- [HarmonyOS 开发主要学什么](#harmonyos-开发主要学什么)
- [开发环境](#开发环境)
- [项目结构](#项目结构)
- [ArkTS 基础](#arkts-基础)
- [ArkUI 声明式 UI](#arkui-声明式-ui)
- [组件和装饰器](#组件和装饰器)
- [布局](#布局)
- [状态管理](#状态管理)
- [事件处理](#事件处理)
- [页面路由](#页面路由)
- [Stage 模型和 Ability](#stage-模型和-ability)
- [生命周期](#生命周期)
- [网络请求](#网络请求)
- [本地数据存储](#本地数据存储)
- [权限](#权限)
- [列表和滚动](#列表和滚动)
- [组件封装](#组件封装)
- [性能优化](#性能优化)
- [前端开发者迁移理解](#前端开发者迁移理解)
- [实战项目路线](#实战项目路线)
- [面试常见问题](#面试常见问题)
- [推荐学习顺序](#推荐学习顺序)
- [官方资料](#官方资料)

## 先建立整体认知

HarmonyOS 应用开发可以先这样理解：

```txt
ArkTS 负责写逻辑
ArkUI 负责写界面
Stage 模型负责组织应用组件和窗口
Ability 负责承载应用页面、服务或系统交互能力
DevEco Studio 负责开发、调试、预览、打包
```

如果类比 Web 前端：

| Web 前端 | HarmonyOS |
| --- | --- |
| TypeScript | ArkTS |
| Vue / React 组件 | ArkUI 组件 |
| 页面路由 | router |
| 浏览器页面生命周期 | Ability / 页面生命周期 |
| localStorage / IndexedDB | Preferences / relationalStore |
| fetch / axios | HTTP 网络模块 |
| Chrome DevTools | DevEco Studio 调试工具 |

但注意：鸿蒙不是浏览器开发。它是原生应用开发，最终运行在系统应用模型里，会涉及权限、生命周期、设备能力、应用签名、发布审核等内容。

## HarmonyOS 开发主要学什么

核心知识可以拆成 8 块：

```txt
1. ArkTS 语言
2. ArkUI 组件和布局
3. 状态管理
4. 页面路由和导航
5. Stage 模型和 Ability
6. 网络请求和数据存储
7. 权限和系统能力
8. 调试、性能优化和发布
```

新手不要一上来就看所有系统 API。先能写出一个完整小应用，再逐步补系统能力。

## 开发环境

常见工具：

- DevEco Studio：官方 IDE。
- HarmonyOS SDK：开发套件。
- 模拟器或真机：运行和调试应用。
- AppGallery Connect：应用发布、签名、测试、质量服务等。

建议准备：

- 熟悉 TypeScript 基础。
- 熟悉组件化开发思想。
- 能看懂异步代码，例如 Promise、async/await。
- 理解移动端页面生命周期和权限申请。

创建项目时，通常选择：

```txt
Application
ArkTS
Stage 模型
```

Stage 模型是 HarmonyOS NEXT 主推且长期演进的应用模型，适合作为新项目默认选择。

## 项目结构

不同版本模板会有差异，但常见结构大致类似：

```txt
entry/
  src/
    main/
      ets/
        entryability/
          EntryAbility.ets
        pages/
          Index.ets
      resources/
        base/
          element/
          media/
          profile/
      module.json5
  build-profile.json5
oh-package.json5
build-profile.json5
```

常见文件含义：

| 文件或目录 | 作用 |
| --- | --- |
| `pages/Index.ets` | 页面代码 |
| `entryability/EntryAbility.ets` | 应用入口 Ability |
| `resources/` | 图片、字符串、颜色、配置等资源 |
| `module.json5` | 模块配置、页面路由、权限等 |
| `oh-package.json5` | 包管理配置 |
| `build-profile.json5` | 构建配置 |

初学阶段最常改的是：

```txt
pages/*.ets
resources/*
module.json5
```

## ArkTS 基础

ArkTS 可以理解成面向 HarmonyOS 优化的 TypeScript 风格语言。写法和 TypeScript 很接近，但在类型约束、运行模型、部分语法能力上会更强调静态类型和性能。

### 变量和类型

```ts
let name: string = "Tom";
let age: number = 18;
let isVip: boolean = true;
```

数组：

```ts
let list: number[] = [1, 2, 3];
let names: Array<string> = ["Alice", "Bob"];
```

对象类型：

```ts
interface User {
  id: number;
  name: string;
  age?: number;
}

let user: User = {
  id: 1,
  name: "Tom",
};
```

函数：

```ts
function add(a: number, b: number): number {
  return a + b;
}
```

### class

```ts
class UserModel {
  id: number;
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  getDisplayName(): string {
    return `${this.id}-${this.name}`;
  }
}

const user = new UserModel(1, "Tom");
```

### async/await

```ts
async function loadData(): Promise<string> {
  return "data";
}

async function main() {
  const result = await loadData();
  console.info(result);
}
```

HarmonyOS 开发里，网络、文件、数据库、权限等很多 API 都会涉及异步。

## ArkUI 声明式 UI

ArkUI 是 HarmonyOS 的声明式 UI 框架。

声明式 UI 的意思是：你描述“界面应该长什么样”，框架根据状态变化自动更新界面。

一个最简单页面：

```ts
@Entry
@Component
struct Index {
  build() {
    Column() {
      Text("Hello HarmonyOS")
        .fontSize(24)
        .fontWeight(FontWeight.Bold)

      Button("点击")
        .margin({ top: 20 })
    }
    .width("100%")
    .height("100%")
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }
}
```

重点：

- `@Entry` 表示页面入口组件。
- `@Component` 表示自定义组件。
- `struct Index` 定义组件。
- `build()` 返回 UI 描述。
- `Column()`、`Text()`、`Button()` 是 UI 组件。
- `.fontSize()`、`.margin()` 这种链式调用设置样式。

### 和 Vue / React 的相似点

Vue：

```vue
<template>
  <div>{{ count }}</div>
</template>
```

React：

```tsx
function App() {
  return <div>{count}</div>;
}
```

ArkUI：

```ts
Text(`${this.count}`)
```

核心都是：

```txt
状态 -> UI
状态变化 -> UI 更新
```

## 组件和装饰器

鸿蒙开发里装饰器很重要。

常见装饰器：

| 装饰器 | 作用 |
| --- | --- |
| `@Entry` | 标记页面入口组件 |
| `@Component` | 标记自定义组件 |
| `@State` | 组件内部响应式状态 |
| `@Prop` | 父组件传给子组件的单向数据 |
| `@Link` | 父子组件双向同步状态 |
| `@Builder` | 封装 UI 构建函数 |
| `@Provide` / `@Consume` | 跨层级共享状态 |
| `@Observed` / `@ObjectLink` | 对象级响应式相关 |

### @State

`@State` 用于组件内部状态。

```ts
@Entry
@Component
struct CounterPage {
  @State count: number = 0;

  build() {
    Column() {
      Text(`count: ${this.count}`)
        .fontSize(24)

      Button("加一")
        .onClick(() => {
          this.count++;
        })
    }
  }
}
```

当 `this.count` 改变，页面会重新刷新相关 UI。

### @Prop

`@Prop` 用于父组件向子组件传值，子组件接收后使用。

```ts
@Component
struct UserCard {
  @Prop name: string;

  build() {
    Text(this.name)
      .fontSize(18)
  }
}

@Entry
@Component
struct Index {
  build() {
    Column() {
      UserCard({ name: "Tom" })
    }
  }
}
```

### @Link

`@Link` 适合父子组件共享并修改同一个状态。

```ts
@Component
struct CounterButton {
  @Link count: number;

  build() {
    Button("子组件加一")
      .onClick(() => {
        this.count++;
      })
  }
}

@Entry
@Component
struct Index {
  @State count: number = 0;

  build() {
    Column() {
      Text(`${this.count}`)
      CounterButton({ count: $count })
    }
  }
}
```

这里 `$count` 表示把父组件状态以双向绑定方式传给子组件。

## 布局

ArkUI 常用布局组件：

| 组件 | 作用 |
| --- | --- |
| `Column` | 垂直排列 |
| `Row` | 水平排列 |
| `Stack` | 层叠布局 |
| `Flex` | 弹性布局 |
| `Grid` | 网格布局 |
| `List` | 列表布局 |
| `Scroll` | 滚动容器 |

### Column

```ts
Column() {
  Text("标题")
  Text("内容")
  Button("确认")
}
.width("100%")
.height("100%")
.justifyContent(FlexAlign.Center)
.alignItems(HorizontalAlign.Center)
```

### Row

```ts
Row() {
  Text("左侧")
  Text("右侧")
}
.width("100%")
.justifyContent(FlexAlign.SpaceBetween)
```

### Stack

```ts
Stack() {
  Image($r("app.media.banner"))
    .width("100%")
    .height(200)

  Text("覆盖在图片上")
    .fontColor(Color.White)
}
```

`Stack` 类似 CSS 里的层叠定位，适合做封面、浮层、角标。

### 常见尺寸写法

```ts
Text("hello")
  .width("100%")
  .height(48)
  .padding(12)
  .margin({ top: 10, bottom: 10 })
```

注意：

- 数字通常表示 vp 这类逻辑像素。
- 字符串百分比表示相对父容器。
- 移动端布局要考虑不同屏幕尺寸。

## 状态管理

最简单的状态管理是组件内部 `@State`。

```ts
@State keyword: string = "";
@State list: string[] = [];
```

当应用变复杂时，要区分几类状态：

| 状态类型 | 示例 | 建议 |
| --- | --- | --- |
| 局部 UI 状态 | 弹窗开关、输入框内容 | 放组件内部 |
| 页面状态 | 列表数据、分页信息 | 放页面组件或页面模型 |
| 跨组件状态 | 登录用户、主题 | 用 `@Provide` / `@Consume` 或统一状态模块 |
| 持久状态 | token、设置项 | 存 Preferences 或数据库 |

### 状态设计原则

- 能局部就不要全局。
- 不要把所有东西都塞进一个大对象。
- 网络返回数据和 UI 展示状态要分清。
- 组件卸载时清理定时器、监听器、异步任务引用。

### 派生状态

如果一个值可以从已有状态计算出来，不一定要单独存。

```ts
@State price: number = 100;
@State count: number = 2;

build() {
  Text(`总价：${this.price * this.count}`)
}
```

避免：

```ts
@State total: number = 200;
```

如果 `price` 或 `count` 变了，但忘记同步 `total`，就会出现状态不一致。

## 事件处理

按钮点击：

```ts
Button("提交")
  .onClick(() => {
    console.info("submit");
  })
```

输入框变化：

```ts
TextInput({ placeholder: "请输入关键词" })
  .onChange((value: string) => {
    this.keyword = value;
  })
```

滚动、触摸、手势等也都有对应事件或手势 API。

### 高频事件要注意性能

例如输入搜索：

```ts
TextInput({ placeholder: "搜索" })
  .onChange((value: string) => {
    this.keyword = value;
    this.search(value);
  })
```

每输入一个字符就请求接口，可能太频繁。可以做防抖：

```ts
private timer: number = -1;

debouncedSearch(keyword: string) {
  if (this.timer !== -1) {
    clearTimeout(this.timer);
  }

  this.timer = setTimeout(() => {
    this.search(keyword);
  }, 300);
}
```

## 页面路由

页面跳转常见使用 router。

```ts
import router from "@ohos.router";

router.pushUrl({
  url: "pages/Detail",
  params: {
    id: 1,
  },
});
```

返回：

```ts
router.back();
```

接收参数：

```ts
import router from "@ohos.router";

const params = router.getParams() as Record<string, number>;
```

### 路由设计建议

- 页面路径统一管理，避免到处写字符串。
- 页面参数定义清楚类型。
- 列表页进入详情页，只传必要参数，例如 `id`。
- 详情数据优先由详情页自己请求，避免传大对象。

示例：

```ts
export const Routes = {
  Home: "pages/Index",
  Detail: "pages/Detail",
};
```

使用：

```ts
router.pushUrl({
  url: Routes.Detail,
  params: {
    id: item.id,
  },
});
```

## Stage 模型和 Ability

Stage 模型是 HarmonyOS NEXT 主推的应用模型。可以先这样理解：

```txt
Stage 是应用运行的舞台
Ability 是应用能力单元
WindowStage 管理窗口
页面运行在窗口中
```

常见 Ability：

| 类型 | 作用 |
| --- | --- |
| UIAbility | 有界面的应用能力，承载页面 |
| ExtensionAbility | 扩展能力，适合特定系统场景 |

常见入口：

```txt
EntryAbility.ets
```

简化理解：

```txt
应用启动
  |
  v
EntryAbility 创建
  |
  v
创建 WindowStage
  |
  v
加载首页页面
```

### EntryAbility 常见职责

- 应用窗口创建。
- 加载首页。
- 处理应用前后台切换。
- 处理启动参数。
- 做少量全局初始化。

不要把大量业务逻辑都堆在 EntryAbility 里。它更像应用入口和生命周期管理处。

## 生命周期

鸿蒙开发里要关注两类生命周期：

```txt
Ability 生命周期
页面 / 组件生命周期
```

### Ability 生命周期

常见阶段可以粗略理解为：

```txt
创建 -> 前台 -> 后台 -> 销毁
```

应用进入后台时要考虑：

- 暂停不必要的刷新。
- 保存临时状态。
- 停止定位、传感器等高耗电能力。
- 处理安全数据隐藏。

应用回到前台时：

- 刷新必要数据。
- 恢复页面状态。
- 检查登录态是否过期。

### 页面和组件生命周期

页面组件里常见生命周期函数：

```ts
aboutToAppear() {
  console.info("页面即将显示");
}

aboutToDisappear() {
  console.info("页面即将消失");
}
```

常见用法：

```ts
aboutToAppear() {
  this.loadData();
}

aboutToDisappear() {
  this.clearTimer();
}
```

原则：

- 请求页面数据可以放 `aboutToAppear`。
- 清理定时器、监听器可以放 `aboutToDisappear`。
- 不要在生命周期里做太重的同步任务。

## 网络请求

鸿蒙应用可以使用系统 HTTP 能力请求接口。实际项目建议封装一层请求工具，统一处理：

- baseURL
- header
- token
- 超时
- 错误码
- loading
- 日志
- 重试

伪代码结构：

```ts
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

class HttpClient {
  async get<T>(url: string): Promise<T> {
    // 这里封装系统 HTTP 请求
    // 统一解析响应
    // 统一处理错误
    throw new Error("not implemented");
  }
}
```

页面中使用：

```ts
@State loading: boolean = false;
@State list: string[] = [];

async loadData() {
  this.loading = true;

  try {
    this.list = await api.getList();
  } catch (error) {
    console.error("load failed", JSON.stringify(error));
  } finally {
    this.loading = false;
  }
}
```

### 网络请求注意点

- 不要在 UI 代码里散落大量请求细节。
- 请求失败要给用户反馈。
- 页面销毁后避免继续更新已销毁页面状态。
- token 过期要统一处理。
- 列表分页要处理重复请求和竞态问题。

竞态问题例子：

```txt
用户先搜索 a，再快速搜索 ab。
请求 a 比请求 ab 更晚返回。
如果不处理，页面可能显示 a 的旧结果。
```

解决思路：

```ts
private requestId: number = 0;

async search(keyword: string) {
  const currentId = ++this.requestId;
  const result = await api.search(keyword);

  if (currentId !== this.requestId) {
    return;
  }

  this.list = result;
}
```

## 本地数据存储

常见存储方式：

| 方式 | 适合存什么 |
| --- | --- |
| Preferences | 少量 key-value 设置，例如 token、主题、开关 |
| relationalStore | 结构化数据，例如收藏、记录、离线数据 |
| 文件存储 | 图片、文档、缓存文件 |

### Preferences

适合：

- token
- 用户设置
- 首次打开标记
- 主题配置

不要存：

- 大列表数据
- 大文件
- 复杂关系数据

封装思路：

```ts
class StorageService {
  async setString(key: string, value: string): Promise<void> {
    // 写入 Preferences
  }

  async getString(key: string): Promise<string> {
    // 读取 Preferences
    return "";
  }
}
```

### 数据存储原则

- 敏感数据要考虑安全存储。
- 缓存要有过期策略。
- 数据库表结构要可迁移。
- 不要在主线程做大量同步读写。

## 权限

移动端开发必须关注权限。

常见权限场景：

- 网络访问
- 相机
- 相册
- 麦克风
- 定位
- 通知
- 文件访问

权限通常需要：

```txt
1. 在配置文件声明权限
2. 运行时向用户申请权限
3. 处理用户同意、拒绝、永久拒绝
```

权限设计建议：

- 用到时再申请，不要一启动就申请一堆权限。
- 申请前用清楚的话告诉用户为什么需要。
- 用户拒绝后不要死循环弹窗。
- 没权限时提供降级方案。

## 列表和滚动

列表是移动端最常见场景。

简单列表：

```ts
@State list: string[] = ["A", "B", "C"];

build() {
  List() {
    ForEach(this.list, (item: string) => {
      ListItem() {
        Text(item)
          .height(48)
          .fontSize(16)
      }
    })
  }
}
```

### 列表开发重点

- 空状态。
- 加载中。
- 加载失败。
- 下拉刷新。
- 上拉加载更多。
- 列表项点击。
- 长列表性能。

页面结构可以这样设计：

```txt
loading = true       -> 显示加载中
error 不为空         -> 显示失败重试
list.length === 0   -> 显示空状态
list 有数据          -> 显示列表
```

### 长列表优化

- 避免列表项组件太复杂。
- 图片懒加载。
- 列表项使用稳定 key。
- 分页加载。
- 避免滚动中做重计算。
- 大量数据考虑懒渲染或虚拟化能力。

## 组件封装

不要所有 UI 都写在一个页面里。建议按业务和复用程度拆组件。

例如：

```txt
pages/
  Home.ets
components/
  SearchBar.ets
  EmptyView.ets
  LoadingView.ets
  UserCard.ets
services/
  userApi.ets
models/
  User.ets
utils/
  format.ets
```

### 组件封装原则

- 组件名表达业务含义。
- 输入用参数，输出用事件。
- 组件内部状态尽量少。
- 不要让通用组件依赖具体页面接口。
- 复杂页面先拆结构，再抽复用。

示例：

```ts
@Component
struct EmptyView {
  @Prop text: string;

  build() {
    Column() {
      Text(this.text)
        .fontSize(16)
        .fontColor("#999999")
    }
    .width("100%")
    .padding(24)
  }
}
```

使用：

```ts
EmptyView({ text: "暂无数据" })
```

## 性能优化

鸿蒙应用性能优化可以从 5 个方向看：

```txt
启动速度
页面渲染
列表滚动
网络和缓存
内存和资源释放
```

### 启动优化

- EntryAbility 里不要做大量同步初始化。
- 非关键 SDK 延后初始化。
- 首页接口并发请求，避免串行等待。
- 首屏先显示骨架或缓存数据。

### 渲染优化

- 减少不必要的状态更新。
- 状态粒度合理，不要一个大状态牵动整个页面。
- 列表项组件保持轻量。
- 图片使用合适尺寸。
- 避免在 `build()` 中写重计算。

不推荐：

```ts
build() {
  Column() {
    Text(this.bigList.map(item => item.name).join(","))
  }
}
```

更好：

```ts
private displayText: string = "";

updateDisplayText() {
  this.displayText = this.bigList.map(item => item.name).join(",");
}
```

### 网络优化

- 接口合并或并发。
- 加缓存。
- 避免重复请求。
- 搜索做防抖。
- 请求错误统一处理。

### 内存优化

- 页面消失时清理定时器。
- 取消不必要监听。
- 大对象不用后释放引用。
- 图片、文件、数据库连接按规范关闭或释放。

### 包体积优化

- 删除无用资源。
- 图片压缩。
- 按需引入模块。
- 不要把调试文件打进生产包。

## 前端开发者迁移理解

如果你会 Vue，可以这样类比：

| Vue | ArkUI |
| --- | --- |
| `.vue` 文件 | `.ets` 页面或组件 |
| `data` / `ref` | `@State` |
| `props` | `@Prop` |
| `v-model` | `@Link` 类双向绑定 |
| `computed` | 派生状态或方法 |
| `watch` | 状态变化后的逻辑处理 |
| `mounted` | `aboutToAppear` |
| `unmounted` | `aboutToDisappear` |
| `vue-router` | `router` |

如果你会 React，可以这样类比：

| React | ArkUI |
| --- | --- |
| Function Component | `@Component struct` |
| JSX | `build()` 里的声明式组件 |
| `useState` | `@State` |
| props | `@Prop` |
| Context | `@Provide` / `@Consume` |
| `useEffect` | 生命周期 + 状态变化处理 |
| React Router | router |

最大区别：

```txt
鸿蒙应用是系统原生应用，不是浏览器页面。
```

所以你还要学：

- 应用模型。
- 权限。
- 系统能力。
- 签名。
- 发布。
- 设备适配。

## 实战项目路线

### 项目 1：计数器

目标：

- 会创建页面。
- 会使用 `@State`。
- 会绑定按钮点击事件。

功能：

```txt
显示 count
点击 +1
点击 -1
点击重置
```

### 项目 2：Todo List

目标：

- 掌握列表渲染。
- 掌握输入框。
- 掌握组件拆分。

功能：

```txt
新增任务
完成任务
删除任务
统计未完成数量
本地保存
```

### 项目 3：新闻列表

目标：

- 掌握网络请求。
- 掌握加载状态。
- 掌握页面跳转。

功能：

```txt
新闻列表
下拉刷新
上拉加载
详情页
错误重试
```

### 项目 4：记账应用

目标：

- 掌握本地数据库。
- 掌握表单。
- 掌握数据统计。

功能：

```txt
新增账单
分类筛选
月度统计
本地持久化
图表展示
```

### 项目 5：天气应用

目标：

- 掌握权限。
- 掌握定位。
- 掌握缓存。

功能：

```txt
定位城市
天气接口
缓存最近数据
异常兜底
多城市管理
```

## 面试常见问题

### 题 1：ArkTS 和 TypeScript 有什么关系

可以这样答：

```txt
ArkTS 和 TypeScript 语法风格接近，适合有 TS 基础的人学习。但 ArkTS 面向 HarmonyOS 应用开发和运行时优化，会更强调静态类型、声明式 UI 和系统应用模型。实际开发不能完全按浏览器 TS 的习惯来写，要遵守 ArkTS 和 ArkUI 的约束。
```

### 题 2：ArkUI 为什么叫声明式 UI

可以这样答：

```txt
声明式 UI 是描述界面和状态之间的关系。开发者不用手动一步步操作原生控件，而是声明当前状态下 UI 应该长什么样。当状态变化时，框架负责更新对应 UI。比如 @State count 改变后，使用 count 的 Text 会自动刷新。
```

### 题 3：@State 和 @Prop 有什么区别

```txt
@State 是组件自己的内部响应式状态，状态变化会刷新 UI。@Prop 是父组件传给子组件的数据，适合单向传递。简单说，@State 管自己，@Prop 接收外部输入。
```

### 题 4：@Prop 和 @Link 有什么区别

```txt
@Prop 偏单向传值，子组件主要读取父组件传入数据。@Link 用于父子组件之间双向同步状态，子组件修改后父组件状态也会变化。能单向就不要双向，双向状态太多会让数据流难追踪。
```

### 题 5：Stage 模型是什么

```txt
Stage 模型是 HarmonyOS NEXT 主推的应用模型。它用 AbilityStage、WindowStage 等概念组织应用组件和窗口，让多个应用组件可以共享 ArkTS 引擎实例，方便复杂应用共享对象和状态，也有利于降低内存占用。
```

### 题 6：页面性能怎么优化

```txt
启动阶段减少同步初始化，非关键任务延后。页面渲染阶段减少不必要状态更新，避免 build 中重计算。列表场景保持列表项轻量，分页加载，图片懒加载。网络层做缓存、防抖、避免重复请求。页面消失时清理定时器、监听器和大对象引用。
```

### 题 7：为什么不要把所有状态都放全局

```txt
全局状态生命周期长，容易造成数据污染和内存压力，也会让状态变化影响范围变大。局部 UI 状态应该放组件内部，跨页面或跨组件真正共享的数据才考虑全局管理或持久化。
```

### 题 8：页面请求数据放在哪里

```txt
简单页面可以在 aboutToAppear 中请求数据。复杂项目建议把请求封装到 service/api 层，页面只负责调用和管理 loading、error、data 状态。这样代码更清晰，也方便复用和测试。
```

## 推荐学习顺序

1. 先学 ArkTS 基础语法，尤其是类型、class、interface、async/await。
2. 学 ArkUI 基础组件：Text、Button、Image、TextInput。
3. 学布局：Column、Row、Stack、List、Scroll。
4. 学状态：@State、@Prop、@Link。
5. 学事件：点击、输入、列表项点击。
6. 学页面路由：跳转、返回、传参。
7. 学生命周期：Ability 生命周期、页面组件生命周期。
8. 学网络请求：封装 API、loading、error、重试。
9. 学本地存储：Preferences、数据库。
10. 学权限和系统能力：相机、定位、通知等。
11. 做 Todo、新闻、记账、天气这类项目。
12. 最后补性能优化、调试、签名和发布。

## 快速记忆

ArkTS：

```txt
像 TypeScript，但服务于 HarmonyOS 原生应用开发。
```

ArkUI：

```txt
状态驱动 UI，build 里声明页面长什么样。
```

@State：

```txt
组件自己的响应式状态，变了就刷新 UI。
```

@Prop：

```txt
父传子，适合单向数据输入。
```

@Link：

```txt
父子双向同步状态，能少用就少用。
```

Stage 模型：

```txt
应用组件和窗口运行的组织模型，HarmonyOS NEXT 主推。
```

Ability：

```txt
应用能力单元，UIAbility 承载有界面页面。
```

性能优化：

```txt
少做同步重活，少刷新大范围 UI，列表轻量，网络缓存，及时清理资源。
```

## 官方资料

- HarmonyOS 开发入口：https://developer.huawei.com/consumer/en/develop/
- HarmonyOS 文档中心：https://developer.huawei.com/consumer/en/doc/
- ArkUI 官方介绍：https://developer.huawei.com/consumer/cn/arkui/
- Stage 模型开发概述：https://developer.huawei.com/consumer/cn/arkui/arkui-stage/

