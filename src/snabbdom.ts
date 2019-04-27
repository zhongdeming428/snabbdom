/* global module, document, Node */
import {Module} from './modules/module';
import {Hooks} from './hooks';
import vnode, {VNode, VNodeData, Key} from './vnode';
import * as is from './is';
import htmlDomApi, {DOMAPI} from './htmldomapi';

function isUndef(s: any): boolean { return s === undefined; }
function isDef(s: any): boolean { return s !== undefined; }

type VNodeQueue = Array<VNode>;

const emptyNode = vnode('', {}, [], undefined, undefined);

function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

function isVnode(vnode: any): vnode is VNode {
  return vnode.sel !== undefined;
}

type KeyToIndexMap = {[key: string]: number};

type ArraysOf<T> = {
  [K in keyof T]: (T[K])[];
}

type ModuleHooks = ArraysOf<Module>;

function createKeyToOldIdx(children: Array<VNode>, beginIdx: number, endIdx: number): KeyToIndexMap {
  let i: number, map: KeyToIndexMap = {}, key: Key | undefined, ch;
  for (i = beginIdx; i <= endIdx; ++i) {
    ch = children[i];
    if (ch != null) {
      key = ch.key;
      if (key !== undefined) map[key] = i;
    }
  }
  return map;
}

const hooks: (keyof Module)[] = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];

export {h} from './h';
export {thunk} from './thunk';

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

  function emptyNodeAt(elm: Element) {
    const id = elm.id ? '#' + elm.id : '';
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : '';
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm);
  }

  function createRmCb(childElm: Node, listeners: number) {
    // 闭包，当 rm 执行次数为 listeners 时，正式移除 childElm。
    return function rmCb() {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm);
        api.removeChild(parent, childElm);
      }
    };
  }
  // 根据 vnode 创建 DOM 元素，然后添加到 vnode.elm。
  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any, data = vnode.data;
    if (data !== undefined) {
      if (isDef(i = data.hook) && isDef(i = i.init)) {
        // 执行 init 钩子。
        i(vnode);
        data = vnode.data;
      }
    }
    let children = vnode.children, sel = vnode.sel;
    if (sel === '!') {
      // sel 为感叹号。
      if (isUndef(vnode.text)) {
        // 并且 vnode.text 未定义时，vnode.text 赋值为空字符串。
        vnode.text = '';
      }
      // vnode 的对应 DOM 定义为注释节点。
      vnode.elm = api.createComment(vnode.text as string);
    } else if (sel !== undefined) {
      // Parse selector
      const hashIdx = sel.indexOf('#');
      const dotIdx = sel.indexOf('.', hashIdx);
      const hash = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      // 从此处看，tag 名称必须放在 sel 最前面。
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel;
      // 如果 data.ns 指定了命名空间，那就创建带命名空间的元素，否则直接创建 DOM 元素。
      const elm = vnode.elm = isDef(data) && isDef(i = (data as VNodeData).ns) ? api.createElementNS(i, tag)
                                                                               : api.createElement(tag);
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot));
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '));
      // 上面两句根据 sel 为 DOM 添加 id 和 class 属性。
      // 下面这句执行 cbs 中的 create 钩子。
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);
      if (is.array(children)) {
        // 如果 vnode.children 是一个数组，那就遍历。
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            // 当数组元素不为 null 时，递归调用 createElm 创建元素，然后通过原生 API 挂载到 elm。
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
      } else if (is.primitive(vnode.text)) {
        // vnode.text 是 string | number 类型时，创建文本节点然后挂载到 elm。
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      i = (vnode.data as VNodeData).hook; // Reuse variable
      if (isDef(i)) {
        // 调用 vnode.data.hook 中的钩子。
        if (i.create) i.create(emptyNode, vnode);
        // 把要插入的 vnode 推入队列。
        if (i.insert) insertedVnodeQueue.push(vnode);
      }
    } else {
      // sel 为 undefined 的时候，直接创建文本节点。
      vnode.elm = api.createTextNode(vnode.text as string);
    }
    // 返回 DOM 元素。
    return vnode.elm;
  }

  // 将 vnode 创建为 DOM，然后插入到指定位置。
  function addVnodes(parentElm: Node,
                     before: Node | null,
                     vnodes: Array<VNode>,
                     startIdx: number,
                     endIdx: number,
                     insertedVnodeQueue: VNodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        // 把 vnode 依次插入到 parentElm。
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }
  // 执行 destroy 钩子。
  function invokeDestroyHook(vnode: VNode) {
    let i: any, j: number, data = vnode.data;
    if (data !== undefined) {
      // 先执行 data.hook 定义的 destroy 钩子。
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode);
      // 然后执行内置模块定义的钩子。
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
      if (vnode.children !== undefined) {
        for (j = 0; j < vnode.children.length; ++j) {
          i = vnode.children[j];
          // 然后递归地调用子节点的 destroy 钩子。
          if (i != null && typeof i !== "string") {
            invokeDestroyHook(i);
          }
        }
      }
    }
  }
  // 移除指定 DOM 下执行序列的 vnode。
  function removeVnodes(parentElm: Node,
                        vnodes: Array<VNode>,
                        startIdx: number,
                        endIdx: number): void {
    for (; startIdx <= endIdx; ++startIdx) {
      let i: any, listeners: number, rm: () => void, ch = vnodes[startIdx];
      if (ch != null) {
        // 如果当前 vnode 不为空。
        if (isDef(ch.sel)) {
          // 先调用 destroy 钩子。
          invokeDestroyHook(ch);
          listeners = cbs.remove.length + 1; // 在所有的 remove 钩子上，再加一个。
          rm = createRmCb(ch.elm as Node, listeners); // rm 用于移除当前 DOM。
          for (i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm); // 把 rm 这回调传给钩子，只有当所有的 rm 被执行了之后，才会正式的移除 vnode。
          if (isDef(i = ch.data) && isDef(i = i.hook) && isDef(i = i.remove)) {
            // 如果当前 vnode 自身定义了 remove 钩子，仍然要执行完这个钩子。
            i(ch, rm);
          } else {
            // 最后调用 rm，正式移除当前 vnode。
            rm();
          }
        } else { // Text node
          api.removeChild(parentElm, ch.elm as Node);
        }
      }
    }
  }

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
        newEndVnode = newCh[--newEndIdx]; // 上面的代码都是调整 children 的位置，为什么 children 可能被移动了呢？
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

  function patchVnode(oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    let i: any, hook: any;
    if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
      // 如果 vnode.data.hook.prepatch 不为空，则执行 prepatch 钩子。
      i(oldVnode, vnode);
    }
    const elm = vnode.elm = (oldVnode.elm as Node);
    let oldCh = oldVnode.children;
    let ch = vnode.children;
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
  // init 函数返回的 patch 函数，用于挂载或者更新 DOM。
  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node;
    const insertedVnodeQueue: VNodeQueue = [];
    // 先执行完钩子函数对象中的所有 pre 回调。
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();
    
    if (!isVnode(oldVnode)) {
      // 如果不是 VNode，
      // 此时以旧的 DOM 为模板构造一个空的 VNode。
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
