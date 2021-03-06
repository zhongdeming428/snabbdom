## 解密虚拟 DOM——snabbdom 核心源码解读

> 本文源码地址：https://github.com/zhongdeming428/snabbdom

对很多人而言，虚拟 DOM 都是一个很高大上而且远不可及的专有名词，以前我也这么认为，后来在学习 Vue 源码的时候发现 Vue 的虚拟 DOM 方案衍生于本文要讲的 snabbdom 工具，经过阅读源码之后才发现，虚拟 DOM 原来就是这么回事，并没有想象中那么难以理解嘛～

这篇文章呢，就单独从 snabbdom 这个库讲起，不涉及其他任何框架，单独从这个库的源码来聊一聊虚拟 DOM。

>  在讲 snabbdom 之前，需要先学习 TypeScript 知识，以及 snabbdom 的基本使用方法。

### 一、snabbdom 核心概念

在学习 snabbdom 源码之前，最好先学会用 snabbdom，至少要掌握 snabbdom 的核心概念，这是阅读框架源码之前基本都要做的准备工作。

> 以下内容可以直接到 snabbdom 官方文档了解。

#### snabbdom 的一些优点

snabbdom 主要具有一下优点：

* 核心部分的源代码只有两百多行（其实不止），容易读懂。
* 通过 `modules` 可以很容易地扩展。
* 钩子函数很丰富，用户可以通过钩子函数直接干涉 Vnode 到 DOM 挂载到最终销毁的全过程。
* 性能很棒。
* 容易集成。

#### modules 的一些优点

* 通过 h 函数，可以很容易地创建 Vnode。
* 通过 h 函数可以创建 SVG 元素。
* 事件处理能力强大。
* 可以通过 Thunks 优化 DOM Diff 和事件。

#### 第三方支持很多的优点

通过一些第三方的插件，可以很容易地支持 JSX、服务端 HTML 输出等等……

#### 核心 API

较为核心的 API 其实就四个：`init`、`patch`、 `h`和`tovnode`，通过这四个 API 就可以玩转虚拟 DOM 啦！

下面简单介绍一下这四个核心函数：

* `init`：这是 snabbdom 暴露出来的一个核心函数，通过它我们才能开始使用许多重要的功能。该函数接受一个数组作为参数，数组内都是 `module`，通过  `init` 注册了一系列要使用的 module 之后，它会给我们返回一个 `patch` 函数。

* `patch`： 该函数是我们挂载或者更新 vnode 的重要途径。它接受两个参数，第一个参数可以是 HTML 元素或者 vnode，第二个元素只能是 vnode。通过 patch 函数，可以对第一个 vnode 进行更新，或者把 vnode 挂载/更新到 DOM 元素上。

* `tovnode`： 用于把真实的 DOM 转化为 vnode，适合把 SSR 生成的 DOM 转化成 vnode，然后进行 DOM 操作。

* `h`： 该函数用于创建 vnode，在许多地方都能见到它的身影。它接受三个参数：

  ```js
  @param {string} selector|tag 标签名或者选择器
  @param {object} data 数据对象，结构在后面讲
  @param {vNode[]|string} children 子节点，可以是文本节点
  ```


#### Module 模块

Module 是 snabbdom 的一个核心概念，snabbdom 的核心主干代码只实现了元素、id、class（不包含动态赋值）、元素内容（包括文本节点在内的子节点）这四个方面；而其他诸如 style 样式、class 动态赋值、attr 属性等功能都是通过 Module 扩展的，它们写成了 snabbdom 的内部默认 Module，在需要的时候引用就行了。

那么 Module 究竟是什么呢？

snabbdom 的官方文档已经讲得很清楚了，Module 的本质是一个对象，对象的键由一些钩子（Hooks）的名称组成，键值都是函数，这些函数能够在特定的 vnode/DOM 生命周期触发，并接受规定的参数，能够对周期中的 vnode/DOM 进行操作。

由于 snabbdom 使用 TypeScript 编写，所以在之后看代码的时候，我们可以非常清楚地看到 Module 的组成结构。

内置 Module 有如下几种：

* `class`：动态控制元素的 class。
* `props`：设置 DOM 的一些属性（properties）。
* `attributes`：同样用于设置 DOM 属性，但是是 attributes，而且 properties。
* `style`：设置 DOM 的样式。
* `dataset`：设置自定义属性。
* `customProperties`：CSS 的变量，使用方法参考官方文档。
* `delayedProperties`：延迟的 CSS 样式，可用于创建动画之类。

#### Hooks 钩子

snabbdom 提供了丰富的生命周期钩子：

| 钩子名称    | 触发时机                                                     | Arguments to callback   |
| ----------- | ------------------------------------------------------------ | ----------------------- |
| `pre`       | patch 开始之前。                                             | none                    |
| `init`      | 已经创建了一个 vnode。                                       | `vnode`                 |
| `create`    | 已经基于 vnode 创建了一个 DOM，但尚未挂载。                  | `emptyVnode, vnode`     |
| `insert`    | 创建的 DOM 被挂载了。                                        | `vnode`                 |
| `prepatch`  | 一个元素即将被 patch。                                       | `oldVnode, vnode`       |
| `update`    | 元素正在被更新。                                             | `oldVnode, vnode`       |
| `postpatch` | 元素已经 patch 完毕。                                        | `oldVnode, vnode`       |
| `destroy`   | 一个元素被直接或间接地移除了。间接移除的情况是指被移除元素的子元素。 | `vnode`                 |
| `remove`    | 一个元素被直接移除了（卸载）。                               | `vnode, removeCallback` |
| `post`      | patch 结束。                                                 | none                    |

__如何使用钩子呢？__

在创建 vnode 的时候，把定义的钩子函数传递给 `data.hook` 就 OK 了；当然还可以在自定义 Module 中使用钩子，同理定义钩子函数并赋值给 Module 对象就可以了。

__注意__

Module 中只能使用以下几种钩子：`pre`, `create`, `update`, `destroy`, `remove`, `post`。

而在 vnode 创建中定义的钩子只能是以下几种：`init`, `create`, `insert`, `prepatch`, `update`, `postpatch`, `destroy`, `remove`。为什么 `pre` 和 `post` 不能使用呢？因为这两个钩子不在 vnode 的生命周期之中，在 vnode 创建之前，pre 已经执行完毕，在 vnode 卸载完毕之后，post 钩子才开始执行。

####  EventListener

snabbdom 提供 DOM 事件处理功能，创建 vnode 时，定义好 `data.on` 即可。比如：

```js
h(
	'div',
    {
        on: {
            click: function() { /*...*/}
        }
    }
)
```

如上，就定义了一个 click 事件处理函数。

那么如果我们要预先传入一些自定义的参数那该怎么做呢？此时我们应该通过数组定义 handler：

```js
h(
	'div',
    {
        on: {
            click: [
                function(data) {/*...*/},
                data
            ]
        }
    }
)
```

那我们的事件对象如何获取呢？这一点 snabbdom 已经考虑好了，event 对象和 vnode 对象会附加在我们的自定义参数后传入到 handler。

#### Thunk

根据官方文档的说明，Thunk 是一种优化策略，可以防止创建重复的 vnode，然后对实际未发生变化的 vnode 做替换或者 patch，造成不必要的性能损耗。在后面的源码分析中，再做详细说明吧。

### 二、源码目录结构

在首先查看源代码之前，先分析一下源码的目录结构，好有的放矢的进行阅读，下面是 `src` 目录下的文件结构：

```bash
.
├── helpers
│   └── attachto.ts
├── hooks.ts // 定义了钩子函数的类型
├── htmldomapi.ts	// 定义了一系列 DOM 操作的 API
├── h.ts	// 主要定义了 h 函数
├── is.ts	// 主要定义了一个类型判断辅助函数
├── modules	// 定义内置 module 的目录
│   ├── attributes.ts
│   ├── class.ts
│   ├── dataset.ts
│   ├── eventlisteners.ts
│   ├── hero.ts
│   ├── module.ts
│   ├── props.ts
│   └── style.ts
├── snabbdom.bundle.ts // 导出 h 函数和 patch 函数（注册了所有内置模块）。
├── snabbdom.ts // 导出 init，允许自定义注册模块
├── thunk.ts	// 定义了 thunk
├── tovnode.ts	// 定义了 tovnode 函数
└── vnode.ts	// 定义了 vnode 类型

2 directories, 18 files
```

所以看完之后，我们应该有了一个大致的概念，要较好的了解 vnode，我们可以先从 vnode 下手，结合文档的介绍，可以详细了解虚拟 DOM 的结构。

此外还可以从我们使用 snabbdom 的入口处入手，即 snabbdom.ts。

### 三、虚拟 DOM 结构

这一小节先了解 vnode 的结构是怎么样的，由于 snabbdom 使用 TypeScript 编写，所以关于变量的结构可以一目了然，打开 `vnode.ts`，可以看到关于 vnode 的定义：

```typescript
export interface VNode {
  sel: string | undefined;
  data: VNodeData | undefined;
  children: Array<VNode | string> | undefined;
  elm: Node | undefined;
  text: string | undefined;
  key: Key | undefined;
}
```

可以看到 vnode 的结构其实比较简单，只有 6 个属性。关于这六个属性，官网已经做了介绍：

* `sel`：是一种 CSS 选择器，vnode 挂载为 DOM 时，会基于这个属性构造 HTML 元素。
* `data`：构造 vnode 的数据属性，在构造 DOM 时会用到里面的数据，data 的结构在 `vnode.ts` 中可以找到定义，稍后作介绍。
* `children`：这是一个 vnode 数组，在 vnode 挂载为 DOM 时，其 children 内的所有 vnode 会被构造为 HTML 元素，进一步挂载到上一级节点下。
* `elm`：这是根据当前 vnode 构造的 DOM 元素。
* `text`： 当前 vnode 的文本节点内容。
* `key`：snabbdom 用 `key` 和 `sel` 来区分不同的 vnode，如果两个 vnode 的 `sel` 和 `key` 属性都相等，那么可以认为两个 vnode 完全相等，他们之间的更新需要进一步比对。

往下翻可以看到 VNodeData 的类型定义：

```typescript
export interface VNodeData {
  props?: Props;
  attrs?: Attrs;
  class?: Classes;
  style?: VNodeStyle;
  dataset?: Dataset;
  on?: On;
  hero?: Hero;
  attachData?: AttachData;
  hook?: Hooks;
  key?: Key;
  ns?: string; // for SVGs
  fn?: () => VNode; // for thunks
  args?: Array<any>; // for thunks
  [key: string]: any; // for any other 3rd party module
}
```

可以看出来这些属性基本上都是在 Module 中所使用的，用于对 DOM 的一些数据、属性进行定义，后面再进行介绍。

### 四、Hooks 结构

打开 `hooks.ts`，可以看到源码如下：

```typescript
import {VNode} from './vnode';

export type PreHook = () => any;
export type InitHook = (vNode: VNode) => any;
export type CreateHook = (emptyVNode: VNode, vNode: VNode) => any;
export type InsertHook = (vNode: VNode) => any;
export type PrePatchHook = (oldVNode: VNode, vNode: VNode) => any;
export type UpdateHook = (oldVNode: VNode, vNode: VNode) => any;
export type PostPatchHook = (oldVNode: VNode, vNode: VNode) => any;
export type DestroyHook = (vNode: VNode) => any;
export type RemoveHook = (vNode: VNode, removeCallback: () => void) => any;
export type PostHook = () => any;

export interface Hooks {
  pre?: PreHook;
  init?: InitHook;
  create?: CreateHook;
  insert?: InsertHook;
  prepatch?: PrePatchHook;
  update?: UpdateHook;
  postpatch?: PostPatchHook;
  destroy?: DestroyHook;
  remove?: RemoveHook;
  post?: PostHook;
}
```

这些代码定义了所有钩子函数的结构类型（接受的参数、返回的参数），然后定义了 Hooks 类型，这与我们前面介绍的钩子类型和所接受的参数是一致的。

### 五、Module 结构

打开 `module.ts`，看到源码如下：

```typescript
import {PreHook, CreateHook, UpdateHook, DestroyHook, RemoveHook, PostHook} from '../hooks';

export interface Module {
  pre: PreHook;
  create: CreateHook;
  update: UpdateHook;
  destroy: DestroyHook;
  remove: RemoveHook;
  post: PostHook;
}
```

可以看到，该模块先引用了上一节代码定义的一系列钩子的类型，然后用这些类型进一步定义了 Module。能够看出来 module 实际上就是几种钩子函数组成的一个对象，用于干涉 DOM 的构造。

### 六、`h` 函数

`h` 函数是一个大名鼎鼎的函数，在各个框架中都有这个函数的身影。它的愿意是 `hyperscript`，意思是创造 `HyperText` 的 `JavaScript`，当然包括创造 `HTML` 的 `JavaScript`。在 snabbdom 中也不例外，`h` 函数旨在接受一系列参数，然后构造对应的 vnode，其返回的 vnode 最终会被渲染成 HTML 元素。

看看源代码：

```typescript

export function h(sel: string): VNode;
export function h(sel: string, data: VNodeData): VNode;
export function h(sel: string, children: VNodeChildren): VNode;
export function h(sel: string, data: VNodeData, children: VNodeChildren): VNode;
export function h(sel: any, b?: any, c?: any): VNode {
  var data: VNodeData = {}, children: any, text: any, i: number;
  if (c !== undefined) {
    data = b;
    if (is.array(c)) { children = c; }
    else if (is.primitive(c)) { text = c; }
    else if (c && c.sel) { children = [c]; }
  } else if (b !== undefined) {
    if (is.array(b)) { children = b; }
    else if (is.primitive(b)) { text = b; }
    else if (b && b.sel) { children = [b]; }
    else { data = b; }
  }
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined);
    }
  }
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    addNS(data, children, sel);
  }
  return vnode(sel, data, children, text, undefined);
};
export default h;
```

可以看到前面很大一段都是函数重载，所以不用太关注，只用关注到最后一行：

```typescript
return vnode(sel, data, children, text, undefined);
```

在适配好参数之后，`h`函数调用了 vnode 函数，实现了 vnode 的创建，而 vnode 函数更简单，就是一个工厂函数：

```typescript
export function vnode(sel: string | undefined,
                      data: any | undefined,
                      children: Array<VNode | string> | undefined,
                      text: string | undefined,
                      elm: Element | Text | undefined): VNode {
  let key = data === undefined ? undefined : data.key;
  return {sel: sel, data: data, children: children,
          text: text, elm: elm, key: key};
}
```

它来自于 `vnode.ts`。

总之我们知道 `h` 函数接受相应的参数，返回一个 vnode 就行了。

### 七、snabbdom.ts

> 在讲 snabbdom.ts 之前，本来应该先了解  htmldomapi.ts 的，但是这个模块全都是对于 HTML 元素 API 的封装，没有讲解的必要，所以阅读本章之前，读者自行阅读 htmldomapi.ts 源码即可。

这是整个项目的核心所在，也是定义入口函数的重要文件，这个文件大概有接近 400 行，主要定义了一些工具函数以及一个入口函数。

打开 `snabbdom.ts` ，最早看到的就是一些简单的类型定义，我们也先来了解一下：

```typescript
function isUndef(s: any): boolean { return s === undefined; } // 判断 s 是否为 undefined。

// 判断 s 是否已定义（不为 undefined）。
function isDef(s: any): boolean { return s !== undefined; }

// 一个 VNodeQueue 队列，实际上是 vnode 数组，代表要挂载的 vnode。
type VNodeQueue = Array<VNode>;

// 一个空的 vnode，用于传递给 craete 钩子（查看第一节）。
const emptyNode = vnode('', {}, [], undefined, undefined);

// 判断两个 vnode 是否重复，依据是 key 和 sel。
function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

// 判断是否是 vnode。
function isVnode(vnode: any): vnode is VNode {
  return vnode.sel !== undefined;
}

// 一个对象，用于映射 childen 数组中 vnode 的 key 和其 index 索引。
type KeyToIndexMap = {[key: string]: number};

// T 是一个对象，其中的每一个键都被映射到 ArraysOf 类型，键值是 T 键值的数组集合。
type ArraysOf<T> = {
  [K in keyof T]: (T[K])[];
}

// 参照上面的注释。
type ModuleHooks = ArraysOf<Module>;
```

看完了基本类型的定义，可以继续看 init 函数：

```typescript
export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number, j: number, cbs = ({} as ModuleHooks);

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]];
      if (hook !== undefined) {
        (cbs[hooks[i]] as Array<any>).push(hook);
      }
    }
  }
	
  // 这中间定义了一大堆工具函数，稍后做选择性分析……此处省略。
 
  // init 函数返回的 patch 函数，用于挂载或者更新 DOM。
  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node;
    const insertedVnodeQueue: VNodeQueue = [];
    // 先执行完钩子函数对象中的所有 pre 回调。
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();
    
    if (!isVnode(oldVnode)) {
      // 如果不是 VNode，那此时以旧的 DOM 为模板构造一个空的 VNode。
      oldVnode = emptyNodeAt(oldVnode);
    }

    if (sameVnode(oldVnode, vnode)) {
      // 如果 oldVnode 和 vnode 是同一个 vnode（相同的 key 和相同的选择器），那么更新 oldVnode。
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      // 如果 vnode 不同于 oldVnode，那么直接替换掉 oldVnode 对应的 DOM。
      elm = oldVnode.elm as Node;
      parent = api.parentNode(elm); // oldVnode 对应 DOM 的父节点。

      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        // 如果 oldVnode 的对应 DOM 有父节点，并且有同级节点，那就在其同级节点之后插入 vnode 的对应 DOM。
        api.insertBefore(parent, vnode.elm as Node, api.nextSibling(elm));
        // 在把 vnode 的对应 DOM 插入到 oldVnode 的父节点内后，移除 oldVnode 的对应 DOM，完成替换。
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      // 执行 insert 钩子。因为 module 不包括 insert 钩子，所以不必执行 cbs...
      (((insertedVnodeQueue[i].data as VNodeData).hook as Hooks).insert as any)(insertedVnodeQueue[i]);
    }
    // 执行 post 钩子，代表 patch 操作完成。
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
    // 最终返回 vnode。
    return vnode;
  };
}
```

可以看到 init 函数其实不仅可以接受一个 module 数组作为参数，还可以接受一个 domApi 作为参数，这在官方文档上是没有说明的。可以理解为 snabbdom 允许我们自定义 dom 的一些操作函数，在这个过程中对 DOM 的构造进行干预，只需要我们传递的 domApi 的结构符合预定义就可以了，此处不再细表。

然后可以看到的就是两个嵌套着的循环，大致意思是遍历 hooks 和 modules，构造一个 `ModuleHooks` 类型的 cbs 变量，那这是什么意思呢？

hooks 定义如下：

```typescript
const hooks: (keyof Module)[] = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];
```

那就是把每个 module 中对应的钩子函数整理到 cbs 钩子名称对应的数组中去，比如：

```js
const module1 = {
    create() { /*...*/ },
    update() { /*...*/ }
};
const module2 = {
    create() { /*...*/ },
    update() { /*...*/ }
};
// 经过整理之后……
// cbs 如下：
{
    create: [create1, create2],
    update: [update1, update2]
}
```

这种结构类似于发布——订阅模式的事件中心，以事件名作为键，键值是事件处理函数组成的数组，在事件发生时，数组中的函数会依次执行，与此处一致。

在处理好 hooks 之后，init 内部定义了一系列工具函数，此处暂不讲解，先往后看。

init 处理到最后返回的使我们预期的 patch 函数，该函数是我们使用 snabbdom 的重要入口，其具体定义如下：

```typescript
// init 函数返回的 patch 函数，用于挂载或者更新 DOM。
return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
  let i: number, elm: Node, parent: Node;
  const insertedVnodeQueue: VNodeQueue = [];
  // 先执行完钩子函数对象中的所有 pre 回调。
  for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();
  
  if (!isVnode(oldVnode)) {
    // 如果不是 VNode，那此时以旧的 DOM 为模板构造一个空的 VNode。
    oldVnode = emptyNodeAt(oldVnode);
  }

  if (sameVnode(oldVnode, vnode)) {
    // 如果 oldVnode 和 vnode 是同一个 vnode（相同的 key 和相同的选择器），那么更新 oldVnode。
    patchVnode(oldVnode, vnode, insertedVnodeQueue);
  } else {
    // 如果 vnode 不同于 oldVnode，那么直接替换掉 oldVnode 对应的 DOM。
    elm = oldVnode.elm as Node;
    parent = api.parentNode(elm); // oldVnode 对应 DOM 的父节点。

    createElm(vnode, insertedVnodeQueue);

    if (parent !== null) {
      // 如果 oldVnode 的对应 DOM 有父节点，并且有同级节点，那就在其同级节点之后插入 vnode 的对应 DOM。
      api.insertBefore(parent, vnode.elm as Node, api.nextSibling(elm));
      // 在把 vnode 的对应 DOM 插入到 oldVnode 的父节点内后，移除 oldVnode 的对应 DOM，完成替换。
      removeVnodes(parent, [oldVnode], 0, 0);
    }
  }

  for (i = 0; i < insertedVnodeQueue.length; ++i) {
    // 执行 insert 钩子。因为 module 不包括 insert 钩子，所以不必执行 cbs...
    (((insertedVnodeQueue[i].data as VNodeData).hook as Hooks).insert as any)(insertedVnodeQueue[i]);
  }
  // 执行 post 钩子，代表 patch 操作完成。
  for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
  // 最终返回 vnode。
  return vnode;
};
```

可以看到在 patch 执行的一开始，就遍历了 cbs 中的所有 pre 钩子，也就是所有 module 中定义的 pre 函数。执行完了 pre 钩子，代表 patch 过程已经开始了。

接下来首先判断 oldVnode 是不是 vnode 类型，如果不是，就代表 oldVnode 是一个 HTML 元素，那我们就要把他转化为一个 vnode，方便后面的更新，更新完毕之后再进行挂载。转化为 vnode 的方式很简单，直接将其 DOM 结构挂载到 vnode 的 elm 属性，然后构造好 sel 即可。

随后，通过 `sameVnode` 判断是否是同一个 “vnode”。如果不是，那么就可以直接把两个 vnode 代表的 DOM 元素进行直接替换；如果是“同一个” vnode，那么就需要进行下一步对比，看看到底有哪些地方需要更新，可以看做是一个 DOM Diff 过程。所以这里出现了 snabbdom 的一个小诀窍，通过 sel 和 key 区分 vnode，不相同的 vnode 可以直接替换，不进行下一步的替换。这样做在很大程度上避免了一些没有必要的比较，节约了性能。

完成上面的步骤之后，就已经把 vnode 挂载到 DOM 上了，完成这个步骤之后，需要执行 vnode 的 insert 钩子，告诉所有的模块：一个 DOM 已经挂载了！

最后，执行所有的 post 钩子并返回 vnode，通知所有模块整个 patch 过程已经结束啦！

不难发现重点在于当 oldVnode 和 vnode 是同一个 vnode 时如何进行更新。这就自然而然的涉及到了 `patchVnode` 函数，该函数结构如下：

```typescript
function patchVnode(oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
  let i: any, hook: any;
  if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
    // 如果 vnode.data.hook.prepatch 不为空，则执行 prepatch 钩子。
    i(oldVnode, vnode);
  }
  const elm = vnode.elm = (oldVnode.elm as Node);
  let oldCh = oldVnode.children;
  let ch = vnode.children;
  // 如果两个 vnode 是真正意义上的相等，那完全就不用更新了。
  if (oldVnode === vnode) return;
  if (vnode.data !== undefined) {
    // 如果 vnode 的 data 不为空，那么执行 update。
    for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode);
    i = vnode.data.hook;
    // 执行 vnode.data.hook.update 钩子。
    if (isDef(i) && isDef(i = i.update)) i(oldVnode, vnode);
  }
  if (isUndef(vnode.text)) {
    // 如果 vnode.text 未定义。
    if (isDef(oldCh) && isDef(ch)) {
      // 如果都有 children，那就更新 children。
      if (oldCh !== ch) updateChildren(elm, oldCh as Array<VNode>, ch as Array<VNode>, insertedVnodeQueue);
    } else if (isDef(ch)) {
      // 如果 oldVnode 是文本节点，而更新后 vnode 包含 children；
      // 那就先移除 oldVnode 的文本节点，然后添加 vnode。
      if (isDef(oldVnode.text)) api.setTextContent(elm, '');
      addVnodes(elm, null, ch as Array<VNode>, 0, (ch as Array<VNode>).length - 1, insertedVnodeQueue);
    } else if (isDef(oldCh)) {
      // 如果 oldVnode 有 children，而新的 vnode 只有文本节点；
      // 那就移除 vnode 即可。
      removeVnodes(elm, oldCh as Array<VNode>, 0, (oldCh as Array<VNode>).length - 1);
    } else if (isDef(oldVnode.text)) {
      // 如果更新前后，vnode 都没有 children，那么就添加空的文本节点，因为大前提是 vnode.text === undefined。
      api.setTextContent(elm, '');
    }
  } else if (oldVnode.text !== vnode.text) {
    // 定义了 vnode.text，并且 vnode 的 text 属性不同于 oldVnode 的 text 属性。
    if (isDef(oldCh)) {
      // 如果 oldVnode 具有 children 属性（具有 vnode），那么移除所有 vnode。
      removeVnodes(elm, oldCh as Array<VNode>, 0, (oldCh as Array<VNode>).length - 1);
    }
    // 设置文本内容。
    api.setTextContent(elm, vnode.text as string);
  }
  if (isDef(hook) && isDef(i = hook.postpatch)) {
    // 完成了更新，调用 postpatch 钩子函数。
    i(oldVnode, vnode);
  }
}
```

该函数是用于更新 vnode 的主要函数，所以 vnode 的主要生命周期都在这个函数内完成。首先执行的钩子就是 prepatch，表示元素即将被 patch。然后会判断 vnode 是否包含 data 属性，如果包含则说明需要先更新 data，这时候会调用所有的 update 钩子（包括模块内的和 vnode 自带的 update 钩子），在 update 钩子内完成 data 的合并更新。在 children 更新之后，还会调用 postpatch 钩子，表示 patch 过程已经执行完毕。

接下来从 text 入手，这一大块的注释都在代码里面写得很清楚了，这里不再赘述。重点在于 oldVnode 和 vnode 都有 children 属性的时候，如何更新 children？接下来看 `updateChildren`：

```typescript
function updateChildren(parentElm: Node,
                          oldCh: Array<VNode>,
                          newCh: Array<VNode>,
                          insertedVnodeQueue: VNodeQueue) {
  let oldStartIdx = 0, newStartIdx = 0;
  let oldEndIdx = oldCh.length - 1;
  let oldStartVnode = oldCh[0];
  let oldEndVnode = oldCh[oldEndIdx];
  let newEndIdx = newCh.length - 1;
  let newStartVnode = newCh[0];
  let newEndVnode = newCh[newEndIdx];
  let oldKeyToIdx: any;
  let idxInOld: number;
  let elmToMove: VNode;
  let before: any;

  // 从两端开始开始遍历 children。
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (oldStartVnode == null) {
      oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
    } else if (oldEndVnode == null) {
      oldEndVnode = oldCh[--oldEndIdx];
    } else if (newStartVnode == null) {
      newStartVnode = newCh[++newStartIdx];
    } else if (newEndVnode == null) {
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newStartVnode)) { // 如果是同一个 vnode。
      patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue); // 更新旧的 vnode。
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (sameVnode(oldEndVnode, newEndVnode)) { // 同上，但是是从尾部开始的。
      patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
      api.insertBefore(parentElm, oldStartVnode.elm as Node, api.nextSibling(oldEndVnode.elm as Node));
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
      api.insertBefore(parentElm, oldEndVnode.elm as Node, oldStartVnode.elm as Node);
      oldEndVnode = oldCh[--oldEndIdx];
      newStartVnode = newCh[++newStartIdx];
    } else {
      if (oldKeyToIdx === undefined) {
        // 创造一个 hash 结构，用键映射索引。
        oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
      }
      idxInOld = oldKeyToIdx[newStartVnode.key as string]; // 通过 key 来获取对应索引。
      if (isUndef(idxInOld)) { // New element
        // 如果找不到索引，那就是新元素。
        api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm as Node);
        newStartVnode = newCh[++newStartIdx];
      } else {
        // 找到对应的 child vnode。
        elmToMove = oldCh[idxInOld];
        if (elmToMove.sel !== newStartVnode.sel) {
          // 如果新旧 vnode 的选择器不能对应，那就直接插入到旧 vnode 之前。
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm as Node);
        } else {
          // 选择器匹配上了，可以直接更新。
          patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
          oldCh[idxInOld] = undefined as any; // 已更新的旧 vnode 赋值为 undefined。
          api.insertBefore(parentElm, (elmToMove.elm as Node), oldStartVnode.elm as Node);
        }
        newStartVnode = newCh[++newStartIdx];
      }
    }
  }
  if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
    // 没匹配上的多余的就直接插入到 DOM 咯。
    if (oldStartIdx > oldEndIdx) {
      // newCh 里面有新的 vnode，直接插入到 DOM。
      before = newCh[newEndIdx+1] == null ? null : newCh[newEndIdx+1].elm;
      addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);
    } else {
      // newCh 里面的 vnode 比 oldCh 里面的少，说明有元素被删除了。
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
    }
  }
}
```

`updateVnode` 函数在一开始就从 children 数组的首尾两端开始遍历。可以看到在遍历开始的时候会有一堆的 null 判断，为什么呢？因为后面会把已经更新的 vnode children 赋值为 undefined。

判断完 null 之后，会比较新旧 children 内的节点是否“相同”（排列组合共有四种比较方式），如果相同，那就继续调用 patchNode 更新节点，更新完之后就可以插入 DOM 了；如果四中情况都匹配不到，那么就通过之前建立的 key 与索引之间的映射来寻找新旧 children 数组中对应 child vnode 的索引，找到之后再进行具体操作。关于具体的操作，代码中已经注释了～

对于遍历之后多余的 vnode，再分情况进行比较；如果 oldCh 多于 newCh，那说明该操作删除了部分 DOM。如果 oldCh 少于 newCh，那说明有新增的 DOM。

关于 `updateChildren` 函数的讲述，这篇文章的讲述更为详细：[vue的Virtual Dom实现- snabbdom解密](https://www.cnblogs.com/xuntu/p/6800547.html) ，大家可以去读一下～

讲完最重要的这个函数，整个核心部分基本上是弄完了，不难发现 snabbdom 的秘诀就在于使用：

* 使用虚拟 DOM 模拟真实 DOM，JavaScript 内存操作性能大大优于 DOM 操作，所以性能比较好。
* Diff 算法比较好，只比较同级 vnode，不会循环遍历去比较，而且采用 key 和 sel 标记 vnode，大大优化比较速度。这一做法类似于 Immutable，使用 hash 比较代替对象的循环递归比较，大大降低时间复杂度。

最后还有一个小问题，这个贯穿许多函数的 `insertedVnodeQueue` 数组是干嘛的？它只在 `createElm` 函数中进行 push 操作，然后在最后的 insert 钩子中进行遍历。仔细一想就可以发现，这个插入 vnode 队列存起来的是一个 children 的左右子 children，看下面一段代码：

```js
h(
	'div',
    {},
    [
        h(/*...*/),
        h(/*...*/),
        h(/*...*/)
    ]
)
```

可以看到 div 下面包含了三个 children，那么当这个 div 元素被插入到 DOM 时，它的三个子 children 也会触发 insert 事件，所以在插入 vnode 时，会遍历其所有 children，然后每个 vnode 都会放入到队列中，在插入之后再统一执行 insert 钩子。

以上，就写这么多吧～多的也没时间写了。

### 八、参考文章

* [vue的Virtual Dom实现- snabbdom解密](https://www.cnblogs.com/xuntu/p/6800547.html)

