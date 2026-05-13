# JavaScript 核心机制学习笔记

这份笔记适合用来快速理解 JavaScript 里的几个高频核心概念：闭包、原型链、事件循环、单线程、浏览器进程/线程和 Web Worker。建议先看概念，再跑例子，最后自己做练习。

## 目录

- [闭包](#闭包)
- [原型链](#原型链)
- [闭包和原型链的区别](#闭包和原型链的区别)
- [JS 运行机制总览](#js-运行机制总览)
- [JavaScript 单线程](#javascript-单线程)
- [事件循环](#事件循环)
- [浏览器进程线程和-Web-Worker](#浏览器进程线程和-web-worker)
- [大厂深度场景面试题](#大厂深度场景面试题)
- [Vue 3 深度理解和大厂考察](#vue-3-深度理解和大厂考察)
- [练习题](#练习题)

## 闭包

### 一句话理解

闭包就是：函数可以“记住”它创建时所在作用域里的变量，即使这个函数在外部被调用。

### 基础例子

```js
function createCounter() {
  let count = 0;

  return function () {
    count++;
    return count;
  };
}

const counter = createCounter();

console.log(counter()); // 1
console.log(counter()); // 2
console.log(counter()); // 3
```

`createCounter` 执行完以后，按理说局部变量 `count` 应该被销毁。但返回的内部函数还在使用 `count`，所以 `count` 会被保留下来。

这就是闭包。

### 闭包的组成

闭包通常包含三部分：

- 一个外层函数
- 外层函数里的局部变量
- 一个内部函数，并且内部函数使用了外层变量

```js
function outer() {
  const name = "JavaScript";

  function inner() {
    console.log(name);
  }

  return inner;
}

const fn = outer();
fn(); // JavaScript
```

### 常见用途 1：封装私有变量

```js
function createBankAccount(initialMoney) {
  let money = initialMoney;

  return {
    deposit(amount) {
      money += amount;
      return money;
    },
    withdraw(amount) {
      if (amount > money) {
        return "余额不足";
      }

      money -= amount;
      return money;
    },
    getBalance() {
      return money;
    },
  };
}

const account = createBankAccount(100);

console.log(account.deposit(50)); // 150
console.log(account.withdraw(30)); // 120
console.log(account.getBalance()); // 120

console.log(account.money); // undefined
```

这里 `money` 不能直接从外部访问，只能通过返回的方法操作。

### 常见用途 2：函数工厂

```js
function createMultiplier(num) {
  return function (value) {
    return value * num;
  };
}

const double = createMultiplier(2);
const triple = createMultiplier(3);

console.log(double(10)); // 20
console.log(triple(10)); // 30
```

`double` 记住了 `num = 2`，`triple` 记住了 `num = 3`。

### 常见用途 3：事件回调保存状态

```js
function bindClick() {
  let clickCount = 0;

  document.querySelector("#btn").addEventListener("click", function () {
    clickCount++;
    console.log(`点击了 ${clickCount} 次`);
  });
}

bindClick();
```

每次点击时，回调函数都能访问并更新 `clickCount`。

### 经典面试题：循环里的闭包

```js
for (var i = 0; i < 3; i++) {
  setTimeout(function () {
    console.log(i);
  }, 1000);
}

// 输出：
// 3
// 3
// 3
```

原因：`var` 是函数作用域，三个回调共享同一个 `i`。等定时器执行时，循环已经结束，`i` 已经变成 `3`。

解决方式 1：使用 `let`

```js
for (let i = 0; i < 3; i++) {
  setTimeout(function () {
    console.log(i);
  }, 1000);
}

// 输出：
// 0
// 1
// 2
```

`let` 有块级作用域，每次循环都会创建新的 `i`。

解决方式 2：使用立即执行函数

```js
for (var i = 0; i < 3; i++) {
  (function (currentIndex) {
    setTimeout(function () {
      console.log(currentIndex);
    }, 1000);
  })(i);
}

// 输出：
// 0
// 1
// 2
```

立即执行函数会创建新的作用域，把当前的 `i` 保存下来。

## 原型链

### 一句话理解

原型链就是：对象访问属性时，如果自己身上没有，就会沿着它的原型对象继续往上找。

### 基础例子

```js
const user = {
  name: "Tom",
};

console.log(user.name); // Tom
console.log(user.toString); // function toString() { ... }
```

`user` 自己有 `name`，所以直接返回。

`user` 自己没有 `toString`，JavaScript 会去 `user` 的原型对象上找，最终在 `Object.prototype` 上找到。

### `__proto__` 和 `prototype`

这两个很容易混：

- `prototype` 是函数才有的属性，主要用于构造函数创建实例时共享方法。
- `__proto__` 是对象身上的隐式原型，指向创建它的构造函数的 `prototype`。

```js
function Person(name) {
  this.name = name;
}

Person.prototype.sayHi = function () {
  console.log(`Hi, I am ${this.name}`);
};

const p1 = new Person("Alice");
const p2 = new Person("Bob");

p1.sayHi(); // Hi, I am Alice
p2.sayHi(); // Hi, I am Bob

console.log(p1.__proto__ === Person.prototype); // true
console.log(p2.__proto__ === Person.prototype); // true
```

`sayHi` 没有复制到每个实例对象上，而是放在 `Person.prototype` 上，所有实例共享。

### `new` 做了什么

执行：

```js
const p = new Person("Alice");
```

大致等价于：

```js
const p = {};
p.__proto__ = Person.prototype;
Person.call(p, "Alice");
```

实际过程更完整：

1. 创建一个新对象。
2. 把新对象的原型指向构造函数的 `prototype`。
3. 执行构造函数，并让构造函数里的 `this` 指向新对象。
4. 如果构造函数返回对象，则返回那个对象；否则返回新创建的对象。

### 原型链查找过程

```js
function Animal(type) {
  this.type = type;
}

Animal.prototype.eat = function () {
  console.log(`${this.type} is eating`);
};

const dog = new Animal("dog");

dog.eat(); // dog is eating
```

查找 `dog.eat` 的过程：

1. 先找 `dog` 自己有没有 `eat`。
2. 没有，就找 `dog.__proto__`，也就是 `Animal.prototype`。
3. 找到了 `eat`，执行它。
4. 如果还没找到，会继续向上找 `Animal.prototype.__proto__`，也就是 `Object.prototype`。
5. 再找不到，就到 `null`，查找结束。

### 原型链继承

```js
function Animal(name) {
  this.name = name;
}

Animal.prototype.eat = function () {
  console.log(`${this.name} is eating`);
};

function Dog(name, age) {
  Animal.call(this, name);
  this.age = age;
}

Dog.prototype = Object.create(Animal.prototype);
Dog.prototype.constructor = Dog;

Dog.prototype.bark = function () {
  console.log(`${this.name} is barking`);
};

const dog = new Dog("Lucky", 3);

dog.eat(); // Lucky is eating
dog.bark(); // Lucky is barking

console.log(dog instanceof Dog); // true
console.log(dog instanceof Animal); // true
```

关键点：

- `Animal.call(this, name)` 用来继承实例属性。
- `Object.create(Animal.prototype)` 用来继承原型方法。
- `Dog.prototype.constructor = Dog` 用来修正构造函数指向。

### ES6 class 本质也是原型

```js
class Person {
  constructor(name) {
    this.name = name;
  }

  sayHi() {
    console.log(`Hi, I am ${this.name}`);
  }
}

const person = new Person("Alice");

person.sayHi(); // Hi, I am Alice
console.log(person.__proto__ === Person.prototype); // true
```

`class` 只是语法更清晰，本质上仍然基于原型链。

## 闭包和原型链的区别

| 对比项 | 闭包 | 原型链 |
| --- | --- | --- |
| 关注点 | 变量作用域 | 属性查找 |
| 解决问题 | 如何保留和访问外层变量 | 如何共享属性和方法 |
| 常见场景 | 私有变量、函数工厂、回调状态 | 构造函数、继承、方法共享 |
| 核心机制 | 函数记住创建时的作用域 | 对象沿着原型逐级查找属性 |

## JS 运行机制总览

### 一句话理解

JavaScript 运行一段代码时，大致会经历：

```txt
创建执行上下文 -> 建立作用域链和 this -> 同步代码进入调用栈执行 -> 异步任务交给宿主环境 -> 回调进入任务队列 -> 事件循环调度执行
```

这里的“宿主环境”可以是浏览器，也可以是 Node.js。JS 引擎负责执行 JS，浏览器或 Node 负责提供定时器、网络请求、文件读取等能力。

### JS 引擎主要做什么

JS 引擎，比如 Chrome 的 V8，主要负责：

- 解析 JavaScript 代码。
- 创建执行上下文。
- 管理调用栈。
- 管理堆内存。
- 执行同步代码。
- 做垃圾回收。

但这些能力不是 JS 引擎自己提供的：

- `setTimeout`
- `fetch`
- DOM API
- 文件读取
- Web Worker

这些通常由浏览器或 Node.js 提供。

### 执行上下文

执行上下文可以理解为：代码运行时需要的一份环境信息。

常见执行上下文有三种：

- 全局执行上下文：整个 JS 文件开始运行时创建。
- 函数执行上下文：每次调用函数时创建。
- `eval` 执行上下文：实际项目里很少用。

一个函数每调用一次，都会创建一个新的函数执行上下文。

```js
function add(a, b) {
  const result = a + b;
  return result;
}

const total = add(1, 2);
```

调用 `add(1, 2)` 时，会创建一个新的执行上下文，里面包含：

- 参数：`a = 1`，`b = 2`
- 局部变量：`result`
- 作用域链
- `this` 指向

函数执行完以后，这个执行上下文会从调用栈中弹出。

### 创建阶段和执行阶段

执行上下文通常可以粗略分成两个阶段：

```txt
创建阶段：准备变量、函数、作用域链、this
执行阶段：从上到下真正运行代码
```

这也是“变量提升”的来源。

```js
console.log(a); // undefined
var a = 1;

sayHi(); // hi

function sayHi() {
  console.log("hi");
}
```

可以粗略理解为：

- `var a` 在创建阶段被登记，初始值是 `undefined`。
- `function sayHi` 在创建阶段就已经准备好了函数体。
- 到执行阶段时，代码才一行一行运行。

注意：`let` 和 `const` 也会被登记，但在初始化前不能访问，这段区域叫“暂时性死区”。

```js
console.log(name); // ReferenceError
let name = "Tom";
```

### 调用栈

调用栈负责记录函数调用关系。

```js
function first() {
  second();
}

function second() {
  third();
}

function third() {
  console.log("run");
}

first();
```

调用栈变化：

```txt
first 入栈
second 入栈
third 入栈
console.log 执行
third 出栈
second 出栈
first 出栈
```

如果函数一直递归不结束，调用栈会爆掉：

```js
function loop() {
  loop();
}

loop(); // RangeError: Maximum call stack size exceeded
```

### 栈内存和堆内存

可以先这样理解：

- 栈：存放函数调用、基础类型值、引用地址。
- 堆：存放对象、数组、函数这类复杂数据。

```js
const age = 18;
const user = {
  name: "Tom",
};
```

大致关系：

```txt
age 直接保存 18
user 保存一个地址
真实对象 { name: "Tom" } 放在堆里
```

所以对象赋值复制的是引用地址：

```js
const a = { count: 1 };
const b = a;

b.count = 2;

console.log(a.count); // 2
```

`a` 和 `b` 指向堆里的同一个对象。

### 作用域链

作用域链决定变量怎么查找。

```js
const globalName = "global";

function outer() {
  const outerName = "outer";

  function inner() {
    const innerName = "inner";
    console.log(innerName);
    console.log(outerName);
    console.log(globalName);
  }

  inner();
}

outer();
```

查找变量时，顺序是：

```txt
inner 自己的作用域 -> outer 的作用域 -> 全局作用域 -> 找不到就报错
```

闭包就是作用域链的一个重要应用：内部函数被外部引用后，它仍然能访问创建时的外层作用域。

### this 绑定

`this` 不是看函数写在哪里，而是多数情况下看函数怎么调用。

```js
const user = {
  name: "Tom",
  sayHi() {
    console.log(this.name);
  },
};

user.sayHi(); // Tom
```

这里是 `user.sayHi()` 调用，所以 `this` 指向 `user`。

但如果把函数单独拿出来：

```js
const fn = user.sayHi;
fn(); // 浏览器非严格模式下可能是 window；严格模式下是 undefined
```

这时调用者不再是 `user`，`this` 就丢了。

箭头函数没有自己的 `this`，它会使用定义时外层作用域的 `this`：

```js
const user = {
  name: "Tom",
  sayHi() {
    setTimeout(() => {
      console.log(this.name);
    }, 1000);
  },
};

user.sayHi(); // Tom
```

这里箭头函数里的 `this` 来自 `sayHi`，而 `sayHi` 是通过 `user.sayHi()` 调用的。

### 异步任务怎么运行

JS 主线程不会一直等异步任务完成。

```js
console.log("start");

setTimeout(() => {
  console.log("timeout");
}, 1000);

console.log("end");
```

执行过程：

```txt
1. 输出 start
2. setTimeout 交给浏览器定时器线程
3. 输出 end
4. 1 秒后，回调进入任务队列
5. 调用栈清空后，事件循环把回调拿出来执行
6. 输出 timeout
```

所以输出是：

```txt
start
end
timeout
```

### 垃圾回收

JavaScript 会自动回收不再使用的内存。

常见判断方式可以理解为：一个值如果再也无法从代码中访问到，就可以被回收。

```js
let user = {
  name: "Tom",
};

user = null;
```

当 `user = null` 后，原来的对象 `{ name: "Tom" }` 如果没有其他引用，就可以被垃圾回收。

闭包会让变量被保留，所以不要无意中保存太大的数据：

```js
function createReader() {
  const bigList = new Array(1000000).fill("data");

  return function read(index) {
    return bigList[index];
  };
}

const reader = createReader();
```

只要 `reader` 还存在，`bigList` 就不会被回收，因为返回的函数还在使用它。

### 一张流程图

```txt
JS 源代码
  |
  v
JS 引擎解析代码
  |
  v
创建执行上下文
  |
  v
同步代码进入调用栈执行
  |
  +-- 遇到普通函数：创建新的函数执行上下文，压入调用栈
  |
  +-- 遇到异步 API：交给浏览器或 Node，回调等待进入任务队列
  |
  v
调用栈清空
  |
  v
事件循环检查任务队列
  |
  v
先清空微任务，再执行宏任务
```

### 学习重点

学 JS 运行机制时，重点不是背概念，而是能回答这些问题：

- 这段代码为什么先输出这个？
- 这个变量是从哪个作用域找到的？
- 这个函数调用时 `this` 是谁？
- 这个对象为什么被另一个变量改了？
- 这个闭包为什么让变量没有被释放？
- 这个异步回调为什么最后执行？

能回答这些问题，就说明你开始真正理解 JS 是怎么运行的了。

## JavaScript 单线程

### 一句话理解

JavaScript 主线程同一时间只能做一件事。

也就是说，一段 JS 代码正在执行时，另一段 JS 代码不能同时在主线程里执行。

### 为什么 JS 是单线程

JavaScript 最早主要运行在浏览器里，用来操作页面 DOM。

如果 JS 是多线程，同时有两个线程操作同一个 DOM，就会出现冲突：

```txt
线程 A：删除某个按钮
线程 B：修改这个按钮的文字
```

浏览器很难判断谁先谁后，所以 JS 主线程设计成单线程：同一时间只执行一个任务。

### 单线程不等于只能做同步任务

JS 主线程是单线程，但浏览器不是单线程。

浏览器可以帮 JS 处理很多异步工作，比如：

- 定时器
- 网络请求
- DOM 事件监听
- 文件读取
- Web Worker

JS 主线程负责执行回调函数，浏览器其他线程负责在背后计时、请求、监听事件。

### 单线程阻塞例子

```js
console.log("start");

const start = Date.now();

while (Date.now() - start < 3000) {
  // 模拟耗时任务，阻塞 3 秒
}

console.log("end");
```

这段代码执行时，页面会卡住。因为 `while` 一直占着主线程，浏览器没机会处理点击、渲染等任务。

### 为什么页面会卡

浏览器页面里的很多事情都依赖主线程：

- 执行 JS
- 计算样式
- 布局
- 绘制
- 响应用户操作

如果 JS 长时间占用主线程，页面就无法及时更新，也无法及时响应点击。

### 怎么避免阻塞

常见方式：

- 把大任务拆成多个小任务。
- 使用 `setTimeout` 或 `requestIdleCallback` 分片执行。
- 把重计算放到 Web Worker。
- 避免在主线程写很重的循环。

例子：把任务拆开执行

```js
let count = 0;

function runTask() {
  const end = Math.min(count + 1000, 100000);

  while (count < end) {
    count++;
  }

  if (count < 100000) {
    setTimeout(runTask, 0);
  } else {
    console.log("任务完成");
  }
}

runTask();
```

这种写法会把大循环拆成多次执行，给浏览器留出处理其他任务的机会。

## 事件循环

### 一句话理解

事件循环就是 JS 用来调度同步代码、异步回调、微任务、宏任务的机制。

JS 主线程一次只能执行一个任务，所以异步代码不能“立刻插队”。它们会先进入任务队列，等调用栈清空后，再由事件循环取出来执行。

### 调用栈

调用栈用来记录当前正在执行的函数。

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  console.log("c");
}

a();
```

执行过程：

```txt
a 入栈
b 入栈
c 入栈
console.log 执行
c 出栈
b 出栈
a 出栈
```

只有调用栈清空后，事件循环才会处理任务队列里的回调。

### 宏任务和微任务

常见宏任务：

- 整体 script
- `setTimeout`
- `setInterval`
- `setImmediate`，Node.js 中可用
- I/O
- UI 事件

常见微任务：

- `Promise.then`
- `Promise.catch`
- `Promise.finally`
- `queueMicrotask`
- `MutationObserver`
- `process.nextTick`，Node.js 中可用，并且优先级更特殊

### 执行顺序

可以先记住这个规则：

```txt
同步代码 -> 清空微任务队列 -> 执行一个宏任务 -> 清空微任务队列 -> 执行下一个宏任务
```

例子：

```js
console.log("1");

setTimeout(() => {
  console.log("2");
}, 0);

Promise.resolve().then(() => {
  console.log("3");
});

console.log("4");

// 输出：
// 1
// 4
// 3
// 2
```

解释：

1. `console.log("1")` 是同步代码，先执行。
2. `setTimeout` 回调进入宏任务队列。
3. `Promise.then` 回调进入微任务队列。
4. `console.log("4")` 是同步代码，继续执行。
5. 同步代码执行完，调用栈清空。
6. 先清空微任务，所以输出 `3`。
7. 再执行宏任务，所以输出 `2`。

### 微任务会先于下一个宏任务

```js
setTimeout(() => {
  console.log("timeout");
}, 0);

Promise.resolve()
  .then(() => {
    console.log("promise 1");
  })
  .then(() => {
    console.log("promise 2");
  });

console.log("sync");

// 输出：
// sync
// promise 1
// promise 2
// timeout
```

即使 `setTimeout` 的时间是 `0`，它也不会立刻执行。它会进入宏任务队列，等同步代码和微任务都执行完。

### 微任务里继续创建微任务

```js
Promise.resolve().then(() => {
  console.log("micro 1");

  Promise.resolve().then(() => {
    console.log("micro 2");
  });
});

setTimeout(() => {
  console.log("macro");
}, 0);

console.log("sync");

// 输出：
// sync
// micro 1
// micro 2
// macro
```

每次执行宏任务之前，都会尽量把当前微任务队列清空。

### async 和 await 的执行顺序

`async/await` 本质上也是基于 Promise。

```js
async function test() {
  console.log("2");
  await Promise.resolve();
  console.log("4");
}

console.log("1");
test();
console.log("3");

// 输出：
// 1
// 2
// 3
// 4
```

可以把 `await` 后面的代码理解成放进了微任务：

```js
Promise.resolve().then(() => {
  console.log("4");
});
```

### 经典面试题

```js
console.log("script start");

setTimeout(() => {
  console.log("setTimeout");
}, 0);

async function async1() {
  console.log("async1 start");
  await async2();
  console.log("async1 end");
}

async function async2() {
  console.log("async2");
}

async1();

new Promise((resolve) => {
  console.log("promise");
  resolve();
}).then(() => {
  console.log("promise then");
});

console.log("script end");
```

输出：

```txt
script start
async1 start
async2
promise
script end
async1 end
promise then
setTimeout
```

核心判断：

- 同步代码先执行。
- `await` 后面的代码进入微任务。
- `Promise.then` 进入微任务。
- `setTimeout` 进入宏任务。

## 浏览器进程线程和 Web Worker

### 进程和线程是什么

简单理解：

- 进程是资源分配的基本单位。
- 线程是任务执行的基本单位。
- 一个进程里可以有多个线程。

类比一下：

```txt
进程：一个公司
线程：公司里的员工
```

公司拥有资源，员工负责执行具体工作。

### 浏览器常见进程

现代浏览器通常是多进程架构，常见进程包括：

- 浏览器主进程：负责地址栏、书签、前进后退、窗口管理等。
- 渲染进程：负责页面渲染、JS 执行、事件处理等。
- 网络进程：负责网络请求。
- GPU 进程：负责图形绘制和合成。
- 插件进程：负责运行插件，现代浏览器里较少关注。

不同浏览器的实现会有差异，但理解这个模型就够用了。

### 渲染进程里的常见线程

一个页面通常运行在渲染进程中，里面有多种线程：

- JS 引擎线程：执行 JavaScript。
- GUI 渲染线程：负责页面布局和绘制。
- 事件触发线程：管理点击、滚动等事件。
- 定时器线程：处理 `setTimeout`、`setInterval` 的计时。
- 网络请求线程：处理异步请求。

注意：JS 引擎线程和 GUI 渲染线程通常是互斥的。JS 执行时间太长时，页面渲染就会被阻塞。

### Web Worker 是什么

Web Worker 可以让浏览器在后台线程执行 JavaScript，适合处理耗时计算。

主线程和 Worker 线程之间不能直接共享普通对象，只能通过消息通信。

主线程：

```js
const worker = new Worker("./worker.js");

worker.postMessage({
  type: "sum",
  payload: [1, 2, 3, 4, 5],
});

worker.onmessage = function (event) {
  console.log("worker 返回：", event.data);
};
```

`worker.js`：

```js
self.onmessage = function (event) {
  const { type, payload } = event.data;

  if (type === "sum") {
    const result = payload.reduce((total, item) => total + item, 0);
    self.postMessage(result);
  }
};
```

### Worker 能做什么

适合放到 Worker 的任务：

- 大量计算
- 图片处理
- 大文件解析
- 加密解密
- 数据排序和过滤
- 复杂图表的数据预处理

不适合放到 Worker 的任务：

- 直接操作 DOM
- 直接读取页面上的元素状态
- 简单到没有性能压力的小逻辑

### Worker 不能直接操作 DOM

```js
// worker.js
document.querySelector("#app"); // 报错
```

Worker 运行在独立线程里，没有 `document`，不能直接操作 DOM。

正确做法是：

1. Worker 负责计算。
2. Worker 把结果发回主线程。
3. 主线程拿到结果后更新 DOM。

### Worker 和主线程通信

```js
// main.js
const worker = new Worker("./worker.js");

worker.postMessage("hello");

worker.onmessage = function (event) {
  console.log("主线程收到：", event.data);
};
```

```js
// worker.js
self.onmessage = function (event) {
  console.log("Worker 收到：", event.data);
  self.postMessage("world");
};
```

输出：

```txt
Worker 收到：hello
主线程收到：world
```

### Worker 注意点

- Worker 文件通常需要通过 HTTP 服务加载，直接打开本地 HTML 可能会受限制。
- Worker 和主线程通信有成本，大数据传来传去也可能慢。
- Worker 适合 CPU 密集型任务，不适合所有异步任务。
- Worker 不能直接访问 DOM。
- Worker 可以使用部分 Web API，例如 `fetch`、`setTimeout`。

## 大厂深度场景面试题

下面这些题更接近字节、阿里这类面试里常见的问法：不是只问概念，而是给一个真实场景，看你能不能解释机制、发现风险、写出可维护实现。

### 题 1：实现一个支持并发限制的请求调度器

场景：

页面一次要请求 100 个接口，但最多只能同时发 3 个。请实现 `limitRequest(tasks, limit)`。

要求：

- `tasks` 是函数数组，每个函数返回 Promise。
- 最多同时运行 `limit` 个任务。
- 返回结果顺序要和 `tasks` 顺序一致。
- 任意任务失败时，整体 Promise 失败。

参考实现：

```js
function limitRequest(tasks, limit) {
  return new Promise((resolve, reject) => {
    const results = [];
    let nextIndex = 0;
    let running = 0;
    let finished = 0;

    function runNext() {
      if (finished === tasks.length) {
        resolve(results);
        return;
      }

      while (running < limit && nextIndex < tasks.length) {
        const currentIndex = nextIndex;
        const task = tasks[currentIndex];

        nextIndex++;
        running++;

        Promise.resolve()
          .then(task)
          .then((result) => {
            results[currentIndex] = result;
            running--;
            finished++;
            runNext();
          })
          .catch(reject);
      }
    }

    runNext();
  });
}
```

测试：

```js
const createTask = (id, delay) => () =>
  new Promise((resolve) => {
    setTimeout(() => {
      console.log("完成", id);
      resolve(id);
    }, delay);
  });

limitRequest(
  [
    createTask(1, 1000),
    createTask(2, 500),
    createTask(3, 300),
    createTask(4, 800),
    createTask(5, 200),
  ],
  2,
).then(console.log);
```

解析：

- `running` 表示当前正在执行的任务数。
- `nextIndex` 表示下一个要启动的任务下标。
- `finished` 表示已经完成的任务数。
- 每完成一个任务，就调用 `runNext()` 补一个新任务。
- `results[currentIndex] = result` 保证结果顺序不被完成时间打乱。

面试官想考：

- Promise 控制流。
- 闭包保存调度状态。
- 异步并发和结果顺序。
- 边界条件处理。

### 题 2：实现一个带缓存和过期时间的函数

场景：

搜索框联想接口会被频繁调用，相同关键字 5 秒内不要重复请求。请实现一个缓存包装函数。

参考实现：

```js
function withCache(fn, ttl = 5000) {
  const cache = new Map();

  return async function (...args) {
    const key = JSON.stringify(args);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && now - cached.time < ttl) {
      return cached.value;
    }

    const value = await fn.apply(this, args);
    cache.set(key, {
      value,
      time: now,
    });

    return value;
  };
}
```

使用：

```js
async function search(keyword) {
  console.log("真实请求：", keyword);
  return ["result", keyword];
}

const cachedSearch = withCache(search, 5000);

cachedSearch("js");
cachedSearch("js"); // 5 秒内复用缓存
```

解析：

- `cache` 是闭包里的私有变量，外部不能直接修改。
- `JSON.stringify(args)` 用来生成参数 key，简单场景够用。
- `fn.apply(this, args)` 保留调用者的 `this`。
- 这个实现缓存的是最终结果，不会合并进行中的相同请求。

追问：如果同一个请求还没完成，又来了第二次怎么办？

可以缓存 Promise：

```js
function withPromiseCache(fn, ttl = 5000) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && now - cached.time < ttl) {
      return cached.promise;
    }

    const promise = Promise.resolve(fn.apply(this, args)).catch((error) => {
      cache.delete(key);
      throw error;
    });

    cache.set(key, {
      promise,
      time: now,
    });

    return promise;
  };
}
```

这里失败时要删除缓存，否则一次失败会污染后续请求。

### 题 3：实现 debounce，并解释为什么要保留 this 和参数

场景：

搜索输入框用户连续输入时，不要每次都请求接口，等用户停止输入 300ms 后再请求。

参考实现：

```js
function debounce(fn, delay) {
  let timer = null;

  return function (...args) {
    const context = this;

    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(context, args);
    }, delay);
  };
}
```

使用：

```js
const input = document.querySelector("#search");

input.addEventListener(
  "input",
  debounce(function (event) {
    console.log(this === input); // true
    console.log(event.target.value);
  }, 300),
);
```

解析：

- `timer` 是闭包变量，用来记住上一次定时器。
- 每次触发时先清掉旧定时器。
- `context = this` 保存调用时的 `this`。
- `args` 保存事件对象等参数。

如果直接写：

```js
setTimeout(fn, delay);
```

`fn` 执行时的 `this` 很可能丢失，事件参数也无法正确传入。

### 题 4：实现 throttle，并说明和 debounce 的区别

场景：

页面滚动时触发频率很高，希望最多每 200ms 执行一次处理函数。

参考实现：

```js
function throttle(fn, delay) {
  let lastTime = 0;
  let timer = null;

  return function (...args) {
    const context = this;
    const now = Date.now();
    const remaining = delay - (now - lastTime);

    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      lastTime = now;
      fn.apply(context, args);
      return;
    }

    if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(context, args);
      }, remaining);
    }
  };
}
```

解析：

- `debounce` 是“停下来再执行”，适合搜索框、窗口 resize 结束后处理。
- `throttle` 是“固定频率执行”，适合滚动、拖拽、鼠标移动。
- 这个版本支持首尾触发：第一次可立即执行，最后一次也不会完全丢掉。

### 题 5：分析 this 丢失并修复

题目：

```js
const user = {
  name: "Tom",
  getName() {
    return this.name;
  },
};

const fn = user.getName;

console.log(fn());
```

问题：输出什么？怎么修复？

解析：

`fn()` 是普通函数调用，不再是 `user.getName()` 调用，所以 `this` 不指向 `user`。

修复方式 1：使用 `bind`

```js
const fn = user.getName.bind(user);
console.log(fn()); // Tom
```

修复方式 2：包一层函数

```js
const fn = () => user.getName();
console.log(fn()); // Tom
```

修复方式 3：调用时保持对象形式

```js
console.log(user.getName()); // Tom
```

追问：

```js
const user = {
  name: "Tom",
  getName: () => {
    return this.name;
  },
};

console.log(user.getName());
```

箭头函数没有自己的 `this`，这里的 `this` 来自外层作用域，不会因为 `user.getName()` 调用而指向 `user`。

### 题 6：实现 new 操作符

题目：

请实现一个 `myNew`，模拟 `new` 的行为。

参考实现：

```js
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype);
  const result = Constructor.apply(obj, args);

  const isObject =
    result !== null && (typeof result === "object" || typeof result === "function");

  return isObject ? result : obj;
}
```

测试：

```js
function Person(name) {
  this.name = name;
}

Person.prototype.sayHi = function () {
  return `Hi, ${this.name}`;
};

const p = myNew(Person, "Alice");

console.log(p.name); // Alice
console.log(p.sayHi()); // Hi, Alice
console.log(p instanceof Person); // true
```

解析：

`new` 的核心步骤：

1. 创建一个新对象。
2. 让新对象的原型指向构造函数的 `prototype`。
3. 执行构造函数，并把 `this` 指向新对象。
4. 如果构造函数返回对象，则返回该对象；否则返回新对象。

### 题 7：实现 instanceof

题目：

请实现一个 `myInstanceof(left, right)`。

参考实现：

```js
function myInstanceof(left, right) {
  if (left === null || (typeof left !== "object" && typeof left !== "function")) {
    return false;
  }

  let proto = Object.getPrototypeOf(left);
  const target = right.prototype;

  while (proto) {
    if (proto === target) {
      return true;
    }

    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
```

测试：

```js
console.log(myInstanceof([], Array)); // true
console.log(myInstanceof([], Object)); // true
console.log(myInstanceof({}, Array)); // false
console.log(myInstanceof(1, Number)); // false
```

解析：

`instanceof` 判断的是：右侧构造函数的 `prototype` 是否出现在左侧对象的原型链上。

### 题 8：事件循环综合题

题目：

```js
console.log("1");

setTimeout(() => {
  console.log("2");
  Promise.resolve().then(() => {
    console.log("3");
  });
}, 0);

Promise.resolve().then(() => {
  console.log("4");
  setTimeout(() => {
    console.log("5");
  }, 0);
});

async function fn() {
  console.log("6");
  await null;
  console.log("7");
}

fn();

console.log("8");
```

输出：

```txt
1
6
8
4
7
2
3
5
```

解析：

第一轮同步代码：

- 输出 `1`
- 第一个 `setTimeout` 进入宏任务队列。
- `Promise.then` 进入微任务队列。
- 调用 `fn()`，先输出 `6`。
- `await null` 后面的 `console.log("7")` 进入微任务队列。
- 输出 `8`。

同步代码结束后，清空微任务：

- 输出 `4`，并创建第二个 `setTimeout`。
- 输出 `7`。

然后执行宏任务：

- 第一个 `setTimeout` 输出 `2`，并创建微任务 `3`。
- 当前宏任务结束，清空微任务，输出 `3`。
- 再执行第二个 `setTimeout`，输出 `5`。

### 题 9：Promise 链式调用和错误穿透

题目：

```js
Promise.resolve()
  .then(() => {
    console.log("A");
    throw new Error("fail");
  })
  .then(() => {
    console.log("B");
  })
  .catch((error) => {
    console.log("C", error.message);
    return "recover";
  })
  .then((value) => {
    console.log("D", value);
  });
```

输出：

```txt
A
C fail
D recover
```

解析：

- 第一个 `then` 输出 `A` 后抛错。
- 后面的普通 `then` 被跳过。
- 错误被最近的 `catch` 捕获。
- `catch` 返回 `"recover"`，后面的 `then` 会继续走成功分支。

追问：如果 `catch` 里继续 `throw error`，后面的 `then` 还会执行吗？

不会执行成功回调，会继续往后找下一个 `catch`。

### 题 10：闭包导致的内存问题

场景：

下面代码有什么风险？

```js
function bindHeavyData() {
  const bigData = new Array(1000000).fill("*");

  document.querySelector("#btn").onclick = function () {
    console.log(bigData.length);
  };
}

bindHeavyData();
```

解析：

按钮点击回调引用了 `bigData`，所以 `bindHeavyData` 执行结束后，`bigData` 仍然不能被回收。

如果这个绑定重复执行很多次，旧回调没有解绑，就可能造成内存持续上涨。

优化方式：

```js
function bindHeavyData() {
  const btn = document.querySelector("#btn");
  const bigData = new Array(1000000).fill("*");

  function handleClick() {
    console.log(bigData.length);
  }

  btn.addEventListener("click", handleClick);

  return function cleanup() {
    btn.removeEventListener("click", handleClick);
  };
}

const cleanup = bindHeavyData();

// 不再需要时
cleanup();
```

面试官想考：

- 闭包不是内存泄漏，但闭包可能让本该释放的数据继续被引用。
- 事件监听、定时器、全局缓存都可能延长对象生命周期。
- 会不会主动设计清理函数。

### 题 11：深拷贝基础版

题目：

请实现一个能处理对象、数组、循环引用的深拷贝。

参考实现：

```js
function deepClone(value, cache = new WeakMap()) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (cache.has(value)) {
    return cache.get(value);
  }

  const result = Array.isArray(value) ? [] : {};
  cache.set(value, result);

  Reflect.ownKeys(value).forEach((key) => {
    result[key] = deepClone(value[key], cache);
  });

  return result;
}
```

测试：

```js
const obj = {
  name: "Tom",
  list: [1, 2, 3],
};

obj.self = obj;

const copied = deepClone(obj);

console.log(copied !== obj); // true
console.log(copied.list !== obj.list); // true
console.log(copied.self === copied); // true
```

解析：

- 基础类型直接返回。
- 对象和数组递归复制。
- `WeakMap` 用来处理循环引用，也避免缓存本身阻止垃圾回收。
- `Reflect.ownKeys` 可以拿到普通 key 和 Symbol key。

追问：

这个版本还没有完整处理 `Date`、`RegExp`、`Map`、`Set`、函数、属性描述符等复杂情况。面试时可以先说明边界，再按需求扩展。

### 题 12：数组扁平化并去重排序

题目：

把下面数组转成 `[1, 2, 3, 4, 5, 6]`。

```js
const arr = [1, [2, 3], [3, [4, [5]]], 6, 2];
```

参考实现：

```js
function flatten(arr) {
  const result = [];

  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item));
    } else {
      result.push(item);
    }
  }

  return result;
}

const output = Array.from(new Set(flatten(arr))).sort((a, b) => a - b);

console.log(output); // [1, 2, 3, 4, 5, 6]
```

解析：

- 递归负责扁平化。
- `Set` 负责去重。
- `sort((a, b) => a - b)` 做数字升序，不能直接用默认 `sort()`。

追问：不用递归怎么写？

```js
function flattenByStack(arr) {
  const stack = [...arr];
  const result = [];

  while (stack.length) {
    const item = stack.pop();

    if (Array.isArray(item)) {
      stack.push(...item);
    } else {
      result.push(item);
    }
  }

  return result.reverse();
}
```

## Vue 3 深度理解和大厂考察

这一节适合在掌握 JS 闭包、原型、事件循环之后学习。Vue 3 的很多设计，本质上都建立在这些 JS 机制上：闭包保存依赖、Proxy 拦截对象、微任务批量更新、组件通过函数重新执行生成虚拟 DOM。

### Vue 3 核心变化

Vue 3 相比 Vue 2，核心变化主要有：

- 响应式从 `Object.defineProperty` 改为 `Proxy`。
- 新增 Composition API：`setup`、`ref`、`reactive`、`computed`、`watch`。
- 更好的 TypeScript 支持。
- 虚拟 DOM 和编译器优化更强。
- 支持 Fragment、Teleport、Suspense。
- 更好的 Tree-shaking，没用到的 API 可以不打包。

面试里不要只说“Vue 3 更快”，要能说出为什么：

- Proxy 可以拦截更多操作。
- 编译器能标记动态节点。
- patch 时可以跳过更多静态内容。
- Composition API 更容易组织复杂逻辑。

### 响应式原理

Vue 3 响应式的核心可以理解成：

```txt
读取数据时收集依赖
修改数据时触发依赖
```

简化版实现：

```js
let activeEffect;
const targetMap = new WeakMap();

function effect(fn) {
  activeEffect = fn;
  fn();
  activeEffect = null;
}

function track(target, key) {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let deps = depsMap.get(key);
  if (!deps) {
    deps = new Set();
    depsMap.set(key, deps);
  }

  deps.add(activeEffect);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const deps = depsMap.get(key);
  if (!deps) return;

  deps.forEach((fn) => fn());
}

function reactive(target) {
  return new Proxy(target, {
    get(obj, key, receiver) {
      const value = Reflect.get(obj, key, receiver);
      track(obj, key);
      return value;
    },
    set(obj, key, value, receiver) {
      const result = Reflect.set(obj, key, value, receiver);
      trigger(obj, key);
      return result;
    },
  });
}
```

测试：

```js
const state = reactive({
  count: 0,
});

effect(() => {
  console.log("count:", state.count);
});

state.count++;
```

输出：

```txt
count: 0
count: 1
```

解析：

- 执行 `effect` 时会读取 `state.count`。
- `get` 拦截触发 `track`，记录当前副作用函数。
- 修改 `state.count` 时触发 `set`。
- `set` 里执行 `trigger`，重新运行相关副作用函数。

大厂常追问：

- 为什么用 `WeakMap`？
- 为什么依赖集合用 `Set`？
- 为什么要用 `Reflect.get` 和 `Reflect.set`？

回答：

- `WeakMap` 的 key 是原始对象，原始对象没有其他引用时可以被垃圾回收。
- `Set` 可以去重，避免同一个 effect 被重复收集。
- `Reflect` 更接近语言内部默认行为，也能正确处理 getter、setter 和继承场景。

### Vue 2 和 Vue 3 响应式区别

Vue 2 使用 `Object.defineProperty`：

```js
function defineReactive(obj, key, value) {
  Object.defineProperty(obj, key, {
    get() {
      console.log("track", key);
      return value;
    },
    set(newValue) {
      console.log("trigger", key);
      value = newValue;
    },
  });
}
```

局限：

- 不能直接监听新增属性。
- 不能直接监听删除属性。
- 数组变化需要特殊处理。
- 初始化时需要递归遍历对象属性。

Vue 3 使用 `Proxy`：

```js
const proxy = new Proxy(obj, {
  get(target, key) {},
  set(target, key, value) {},
  deleteProperty(target, key) {},
  has(target, key) {},
  ownKeys(target) {},
});
```

优势：

- 可以监听新增属性。
- 可以监听删除属性。
- 可以监听 `in`、`Object.keys` 等操作。
- 不需要一开始递归劫持所有属性，访问到深层对象时再代理。

注意：

Proxy 代理的是对象本身，不是对象属性，所以老浏览器很难完整 polyfill。

### ref 和 reactive 的区别

`ref` 适合包装基础类型，也可以包装对象：

```js
const count = ref(0);
console.log(count.value);
count.value++;
```

`reactive` 适合包装对象：

```js
const state = reactive({
  count: 0,
});

state.count++;
```

核心区别：

| 对比项 | ref | reactive |
| --- | --- | --- |
| 适合数据 | 基础类型和对象 | 对象、数组、Map、Set |
| 访问方式 | JS 中需要 `.value` | 直接访问属性 |
| 模板中 | 自动解包 | 直接使用 |
| 替换整体对象 | 可以通过 `.value = 新值` | 不建议直接整体替换 |

常见坑：

```js
const state = reactive({
  count: 0,
});

let { count } = state;
count++;

console.log(state.count); // 0
```

解析：

解构后 `count` 是普通变量，不再保持响应式连接。

修复：

```js
const state = reactive({
  count: 0,
});

const { count } = toRefs(state);

count.value++;

console.log(state.count); // 1
```

### computed 和 watch 的区别

`computed` 适合“由已有状态推导新状态”：

```js
const price = ref(100);
const count = ref(2);

const total = computed(() => price.value * count.value);
```

特点：

- 有缓存。
- 依赖不变时不会重新计算。
- 更像一个响应式的值。

`watch` 适合“状态变化后执行副作用”：

```js
watch(
  () => count.value,
  (newValue, oldValue) => {
    console.log(newValue, oldValue);
    fetchData(newValue);
  },
);
```

特点：

- 适合请求接口、操作本地缓存、手动操作 DOM。
- 可以拿到新旧值。
- 可以配置 `immediate`、`deep`、`flush`。

面试回答：

```txt
computed 关注结果，watch 关注过程。
computed 应该尽量保持纯计算，watch 用来处理副作用。
```

### watchEffect 和 watch 的区别

`watchEffect` 会自动收集依赖：

```js
watchEffect(() => {
  console.log(user.value.name);
});
```

只要函数里访问到的响应式数据变化，就会重新执行。

`watch` 需要显式指定监听源：

```js
watch(
  () => user.value.name,
  (name) => {
    console.log(name);
  },
);
```

区别：

- `watchEffect` 自动收集依赖，立即执行。
- `watch` 手动指定依赖，默认懒执行。
- `watch` 更适合精确控制新旧值。
- `watchEffect` 更适合快速同步多个依赖产生的副作用。

### nextTick 原理

Vue 更新 DOM 不是每次状态变化都立刻更新，而是批量异步更新。

```js
count.value++;
count.value++;
count.value++;
```

这三次修改通常只会触发一次 DOM 更新。

如果修改数据后马上读取 DOM，可能读到旧 DOM：

```js
count.value++;
console.log(el.textContent); // 可能还是旧值
```

正确写法：

```js
count.value++;

await nextTick();

console.log(el.textContent); // 新值
```

原理：

```txt
状态变化 -> 组件更新任务进入队列 -> 使用微任务批量刷新 -> DOM 更新完成 -> nextTick 回调执行
```

大厂常问：

为什么 Vue 要异步更新？

回答：

如果每次状态变化都同步更新 DOM，会导致大量重复渲染。异步批量更新可以把同一轮事件循环里的多次状态修改合并成一次组件更新。

### 虚拟 DOM 和 patch

虚拟 DOM 是用 JS 对象描述真实 DOM。

```js
const vnode = {
  type: "div",
  props: {
    id: "app",
  },
  children: "hello",
};
```

Vue 渲染过程可以简化成：

```txt
template -> render 函数 -> vnode -> patch -> 真实 DOM
```

当状态变化时：

```txt
重新执行 render -> 得到新 vnode -> 新旧 vnode diff -> 最小化更新真实 DOM
```

面试要点：

- 虚拟 DOM 不是一定比手写原生 DOM 快。
- 虚拟 DOM 的价值是声明式编程、跨平台能力、可维护性和稳定的性能下限。
- Vue 3 通过编译时优化减少 diff 成本。

### Vue 3 编译优化

Vue 3 编译器会分析模板，把静态内容和动态内容区分开。

比如：

```vue
<template>
  <div>
    <h1>标题</h1>
    <p>{{ count }}</p>
  </div>
</template>
```

`h1` 是静态节点，`p` 里有动态文本。

Vue 3 会尽量只关注动态部分。

常见优化：

- 静态提升：静态 vnode 提升到 render 外面，避免重复创建。
- Patch Flag：给动态节点打标记，patch 时精准更新。
- Block Tree：收集动态子节点，减少全量遍历。
- 缓存事件处理函数：避免每次 render 都创建新函数。

回答模板：

```txt
Vue 3 的性能提升不只来自 Proxy，也来自编译器。编译器能提前知道哪些节点是静态的，哪些属性是动态的，所以运行时 patch 可以更精准。
```

### key 的作用

题目：

为什么 `v-for` 需要写 `key`？

```vue
<li v-for="item in list" :key="item.id">
  {{ item.name }}
</li>
```

解析：

`key` 帮助 Vue 判断新旧节点是否是同一个节点。

没有稳定 key 时，Vue 可能按位置复用 DOM，导致状态错乱。

典型场景：

```vue
<input
  v-for="item in list"
  :key="item.id"
  :value="item.name"
/>
```

如果使用数组下标作为 key，列表插入、删除、排序时，输入框 DOM 可能被错误复用。

面试回答：

```txt
key 的本质是给 vnode 一个稳定身份，帮助 diff 判断节点复用和移动，避免错误复用 DOM。
```

### 组件通信

常见方式：

- `props`：父传子。
- `emit`：子通知父。
- `v-model`：父子双向绑定语法糖。
- `provide / inject`：跨层级传递。
- `Pinia`：全局状态管理。
- `expose`：父组件通过 ref 调用子组件暴露的方法。

父传子：

```vue
<UserCard :user="user" />
```

子通知父：

```vue
<button @click="$emit('select', user)">选择</button>
```

`provide / inject`：

```js
provide("theme", theme);
const theme = inject("theme");
```

注意：

- `props` 不应该在子组件里直接修改。
- 跨很多层级才考虑 `provide / inject`。
- 多页面共享状态优先考虑 Pinia。

### Composition API 的价值

Options API 按选项组织代码：

```js
export default {
  data() {},
  computed: {},
  methods: {},
  mounted() {},
};
```

当一个组件逻辑复杂时，同一业务逻辑会散落在 `data`、`computed`、`methods`、生命周期里。

Composition API 按功能组织代码：

```js
function useUser() {
  const user = ref(null);

  async function loadUser() {
    user.value = await fetchUser();
  }

  return {
    user,
    loadUser,
  };
}
```

优势：

- 逻辑更容易复用。
- 复杂组件里相关代码可以放在一起。
- TypeScript 类型推导更自然。
- 更适合大型项目维护。

面试回答不要贬低 Options API：

```txt
Options API 对简单组件很直观；Composition API 更适合复杂逻辑抽离和大型项目复用。
```

### setup 执行时机

`setup` 在组件创建阶段执行，早于 `beforeCreate` 和 `created`。

在 `setup` 里：

- 不能直接使用 Options API 里的 `this`。
- 可以接收 `props` 和 `context`。
- 返回的数据可以在模板中使用。

```js
export default {
  props: {
    id: Number,
  },
  setup(props, context) {
    console.log(props.id);

    context.emit("ready");

    return {
      message: "hello",
    };
  },
};
```

`<script setup>` 是编译时语法糖：

```vue
<script setup>
const count = ref(0);
</script>
```

里面声明的变量可以直接在模板使用。

### 生命周期

Options API 和 Composition API 对照：

| Options API | Composition API |
| --- | --- |
| beforeCreate | setup |
| created | setup |
| beforeMount | onBeforeMount |
| mounted | onMounted |
| beforeUpdate | onBeforeUpdate |
| updated | onUpdated |
| beforeUnmount | onBeforeUnmount |
| unmounted | onUnmounted |

注意：

- 请求数据通常可以放在 `onMounted`，也可以在 `setup` 中直接发起，取决于是否依赖 DOM。
- 操作 DOM 要放在 `onMounted` 之后。
- 定时器、事件监听、第三方实例要在 `onUnmounted` 中清理。

### keep-alive

`keep-alive` 用来缓存组件实例。

```vue
<keep-alive>
  <component :is="currentComponent" />
</keep-alive>
```

被缓存的组件切走时不会销毁，而是进入停用状态。

相关生命周期：

- `onActivated`：组件被激活。
- `onDeactivated`：组件被停用。

适合场景：

- tab 页面切换。
- 列表页返回后保留滚动位置。
- 表单页面临时保留输入状态。

不适合场景：

- 数据必须每次进入都重新初始化。
- 缓存太多导致内存压力。

### Teleport

`Teleport` 可以把组件内容渲染到 DOM 的其他位置。

```vue
<teleport to="body">
  <div class="modal">弹窗内容</div>
</teleport>
```

适合：

- 弹窗
- 全局提示
- 下拉菜单
- 浮层

原因：

弹窗如果嵌套在很深的组件里，可能受父元素 `overflow: hidden`、`z-index`、`transform` 影响。Teleport 可以把弹窗直接挂到 `body` 下。

### Suspense

`Suspense` 用来处理异步组件或异步 setup。

```vue
<Suspense>
  <template #default>
    <AsyncUser />
  </template>

  <template #fallback>
    <div>加载中...</div>
  </template>
</Suspense>
```

适合：

- 异步组件加载。
- 页面首屏异步数据。
- 统一 loading 状态。

### Vue 3 性能优化

常见优化手段：

- `v-if` 用于条件切换少的场景。
- `v-show` 用于频繁显示隐藏的场景。
- `v-for` 一定使用稳定 `key`。
- 大列表使用虚拟滚动。
- 合理拆分组件，避免一个组件过大。
- 使用 `computed` 缓存派生数据。
- 不要在模板里写复杂计算。
- 使用 `defineAsyncComponent` 做异步组件。
- 使用 `markRaw` 跳过不需要响应式的大对象。
- 使用 `shallowRef` 或 `shallowReactive` 减少深层代理成本。

例子：

```js
const chartInstance = shallowRef(null);

onMounted(() => {
  chartInstance.value = markRaw(createChart());
});
```

第三方图表实例通常不需要被 Vue 深度代理。

### Vue 3 大厂面试题 1：为什么 reactive 解构会丢失响应式

题目：

```js
const state = reactive({
  count: 0,
});

const { count } = state;

count++;

console.log(state.count);
```

输出：

```txt
0
```

解析：

`reactive` 返回的是 Proxy。访问 `state.count` 时才能触发 `get`。解构后，`count` 只是普通数字，不再经过 Proxy。

修复：

```js
const { count } = toRefs(state);

count.value++;
```

### Vue 3 大厂面试题 2：computed 为什么有缓存

题目：

```js
const count = ref(1);

const double = computed(() => {
  console.log("computed run");
  return count.value * 2;
});

console.log(double.value);
console.log(double.value);
count.value++;
console.log(double.value);
```

输出：

```txt
computed run
2
2
computed run
4
```

解析：

- 第一次读取 `double.value` 时执行 getter。
- 第二次读取时依赖没变，直接返回缓存。
- `count.value++` 后，computed 被标记为 dirty。
- 再次读取时重新计算。

面试回答：

```txt
computed 本质是懒执行的响应式 effect。依赖变化时不会立刻重新计算，而是标记 dirty；下次读取 value 时才重新计算。
```

### Vue 3 大厂面试题 3：watch 的 flush 有什么区别

题目：

`watch` 的 `flush: "pre" | "post" | "sync"` 有什么区别？

回答：

- `pre`：默认值，组件更新前执行。
- `post`：组件 DOM 更新后执行。
- `sync`：同步执行，不经过调度队列。

例子：

```js
watch(
  count,
  () => {
    console.log("DOM 已更新后执行");
  },
  {
    flush: "post",
  },
);
```

使用建议：

- 需要读取更新后的 DOM，用 `post`。
- 大部分业务场景用默认 `pre`。
- `sync` 要慎用，可能导致频繁执行和性能问题。

### Vue 3 大厂面试题 4：为什么不要用 index 做 key

题目：

```vue
<div v-for="(item, index) in list" :key="index">
  <input :value="item.name" />
</div>
```

如果在列表头部插入一项，可能出现什么问题？

解析：

使用 index 作为 key 时，插入后原来的第 0 项变成第 1 项，但它们的 key 也跟着变了。Vue 会按位置复用 DOM，可能导致输入框状态和数据错位。

正确写法：

```vue
<div v-for="item in list" :key="item.id">
  <input :value="item.name" />
</div>
```

稳定 key 应该来自业务唯一 id。

### Vue 3 大厂面试题 5：nextTick 为什么能拿到更新后的 DOM

题目：

```js
count.value++;

await nextTick();

console.log(el.textContent);
```

为什么 `nextTick` 后能读到新 DOM？

解析：

Vue 状态变化后，不会立刻同步更新 DOM，而是把组件更新任务放进队列。这个队列通常通过微任务刷新。

`nextTick` 会等待当前这一轮组件更新队列刷新完成，所以它后面的代码能读到更新后的 DOM。

一句话：

```txt
nextTick 等的是 Vue 的异步 DOM 更新队列，不是简单等一个 setTimeout。
```

### Vue 3 大厂面试题 6：Vue 3 如何减少 diff 成本

回答要点：

- 编译阶段区分静态节点和动态节点。
- 静态节点提升，避免重复创建。
- 动态节点加 Patch Flag，运行时精准更新。
- Block Tree 收集动态子节点，减少无意义遍历。
- 对事件处理函数做缓存，减少重复创建。

示例回答：

```txt
Vue 3 不是每次都盲目全量 diff。编译器会在模板编译时标记动态部分，运行时 patch 可以直接知道哪些属性或文本需要更新，这就是 Patch Flag 的价值。
```

### Vue 3 大厂面试题 7：v-if 和 v-show 如何选择

区别：

- `v-if` 是真正创建和销毁 DOM。
- `v-show` 是切换 CSS 的 `display`。

选择：

- 条件很少变化，用 `v-if`。
- 频繁显示隐藏，用 `v-show`。

例子：

```vue
<Modal v-if="visible" />
<div v-show="active">内容</div>
```

### Vue 3 大厂面试题 8：父子组件更新顺序

问题：

父组件状态变化导致父子组件都要更新，更新顺序是什么？

简化理解：

```txt
父组件先重新 render
子组件接收新的 props 后再更新
DOM patch 按组件树顺序推进
updated 钩子通常子组件先执行，父组件后执行
```

注意：

面试时不需要死背所有内部细节，但要说明组件更新是进入调度队列的，并且 Vue 会保证父子更新顺序稳定，避免子组件拿到过期 props。

### Vue 3 大厂面试题 9：为什么组件里的定时器要清理

题目：

```js
onMounted(() => {
  setInterval(() => {
    console.log("polling");
  }, 1000);
});
```

有什么问题？

解析：

组件卸载后，定时器仍然存在，会继续执行，造成内存泄漏和无效请求。

修复：

```js
let timer = null;

onMounted(() => {
  timer = setInterval(() => {
    console.log("polling");
  }, 1000);
});

onUnmounted(() => {
  clearInterval(timer);
});
```

同样需要清理的还有：

- DOM 事件监听。
- WebSocket。
- 第三方图表实例。
- IntersectionObserver。
- 未完成且可取消的请求。

### Vue 3 大厂面试题 10：如何设计一个可复用的 useRequest

场景：

多个页面都需要请求数据、loading、error、刷新，请设计一个组合式函数。

参考实现：

```js
function useRequest(service, options = {}) {
  const data = ref(options.initialData ?? null);
  const loading = ref(false);
  const error = ref(null);

  async function run(...args) {
    loading.value = true;
    error.value = null;

    try {
      const result = await service(...args);
      data.value = result;
      return result;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  if (options.immediate) {
    run(...(options.defaultParams || []));
  }

  return {
    data,
    loading,
    error,
    run,
    refresh: run,
  };
}
```

使用：

```js
const { data, loading, error, run } = useRequest(fetchUser, {
  immediate: true,
  defaultParams: [userId.value],
});
```

面试扩展：

- 增加防抖。
- 增加缓存。
- 增加请求竞态处理。
- 增加取消请求。
- 增加分页。

请求竞态问题：

```js
let requestId = 0;

async function run(...args) {
  const currentId = ++requestId;
  loading.value = true;

  try {
    const result = await service(...args);

    if (currentId !== requestId) {
      return;
    }

    data.value = result;
    return result;
  } finally {
    if (currentId === requestId) {
      loading.value = false;
    }
  }
}
```

如果后发请求先回来，旧请求结果不能覆盖新请求结果。

## 常见易错点

### 易错点 1：闭包不是“函数里面套函数”这么简单

只有内部函数使用了外部变量，并且这个内部函数被外部继续引用，才更符合闭包的典型场景。

```js
function test() {
  const value = 1;

  function inner() {
    return value;
  }

  return inner;
}
```

### 易错点 2：箭头函数没有自己的 `this`

```js
const user = {
  name: "Tom",
  sayHi: () => {
    console.log(this.name);
  },
};

user.sayHi(); // 通常是 undefined
```

箭头函数的 `this` 来自定义时的外层作用域，不由调用方式决定。

### 易错点 3：不要直接修改内置原型

```js
Array.prototype.first = function () {
  return this[0];
};
```

这种写法虽然能用，但实际项目里不推荐。它可能污染全局行为，影响第三方库或未来语言特性。

## 练习题

### 练习 1：写一个计数器

要求：

- `counter.add()` 每次调用加 1。
- `counter.minus()` 每次调用减 1。
- `counter.value()` 获取当前值。
- 外部不能直接访问内部的数字。

参考答案：

```js
function createCounter() {
  let count = 0;

  return {
    add() {
      count++;
      return count;
    },
    minus() {
      count--;
      return count;
    },
    value() {
      return count;
    },
  };
}

const counter = createCounter();

console.log(counter.add()); // 1
console.log(counter.add()); // 2
console.log(counter.minus()); // 1
console.log(counter.value()); // 1
```

### 练习 2：用原型给用户对象添加方法

要求：

- 创建 `User` 构造函数。
- 每个用户有 `name` 和 `age`。
- 在原型上添加 `sayInfo` 方法。

参考答案：

```js
function User(name, age) {
  this.name = name;
  this.age = age;
}

User.prototype.sayInfo = function () {
  console.log(`我的名字是 ${this.name}，今年 ${this.age} 岁`);
};

const user = new User("小明", 18);
user.sayInfo(); // 我的名字是 小明，今年 18 岁
```

### 练习 3：判断输出结果

```js
function Foo() {}

Foo.prototype.name = "prototype name";

const foo = new Foo();
foo.name = "own name";

console.log(foo.name);
delete foo.name;
console.log(foo.name);
```

答案：

```js
own name
prototype name
```

解释：

第一次访问时，`foo` 自己有 `name`。

删除 `foo.name` 后，再访问 `foo.name`，就会沿着原型链去 `Foo.prototype` 上找。

### 练习 4：判断事件循环输出

```js
console.log("A");

setTimeout(() => {
  console.log("B");
}, 0);

Promise.resolve().then(() => {
  console.log("C");
});

console.log("D");
```

答案：

```txt
A
D
C
B
```

解释：

- `A` 和 `D` 是同步代码。
- `C` 是微任务。
- `B` 是宏任务。
- 执行顺序是：同步代码 -> 微任务 -> 宏任务。

### 练习 5：判断 async/await 输出

```js
async function fn() {
  console.log("2");
  await null;
  console.log("4");
}

console.log("1");
fn();
console.log("3");
```

答案：

```txt
1
2
3
4
```

解释：

`await` 前面的代码是同步执行，`await` 后面的代码会进入微任务。

### 练习 6：把耗时计算放到 Worker

要求：

- 主线程传一个大数组给 Worker。
- Worker 计算数组总和。
- Worker 把结果返回给主线程。

主线程参考答案：

```js
const worker = new Worker("./sum-worker.js");

const list = Array.from({ length: 100000 }, (_, index) => index + 1);

worker.postMessage(list);

worker.onmessage = function (event) {
  console.log("总和：", event.data);
};
```

`sum-worker.js` 参考答案：

```js
self.onmessage = function (event) {
  const list = event.data;
  const result = list.reduce((total, item) => total + item, 0);

  self.postMessage(result);
};
```

## 快速记忆

闭包：

```txt
函数 + 外部变量 + 变量被保留
```

原型链：

```txt
对象自己没有属性 -> 去原型找 -> 一直找到 null
```

事件循环：

```txt
同步代码 -> 微任务 -> 宏任务
```

JS 单线程：

```txt
主线程同一时间只执行一个任务
```

Web Worker：

```txt
重计算交给 Worker -> 结果发回主线程 -> 主线程更新页面
```

## 推荐学习顺序

1. 先理解作用域、执行上下文、`let`、`const`、`var`。
2. 再学习闭包，重点看计数器、私有变量、循环定时器。
3. 再学习对象、构造函数、`new`。
4. 再学习原型链、继承、`class`。
5. 然后学习调用栈、同步任务、异步任务。
6. 再学习事件循环、宏任务、微任务、`async/await`。
7. 最后学习浏览器进程线程模型和 Web Worker。
