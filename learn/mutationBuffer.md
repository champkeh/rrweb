# MutationBuffer 工作原理

`MutationBuffer`，顾名思义，就是`mutation`的缓冲区，用于控制`MutationObserver`的行为。具体是怎么控制的？我们来分析一下。

```ts
class MutationBuffer {
  public processMutations = (mutations: mutationRecord[]) => {
    mutations.forEach(this.processMutation)
    this.emit()
  }
  private processMutation = (m: mutationRecord) => {
    if (isIgnored(m.target)) {
      return;
    }
    switch (m.type) {
      case 'characterData': {
        // ...
      }
      case 'attributes': {
        // ...
      }
      case 'childList': {
        // ...
      }
      default:
        break;
    }
  };
}
```

我们知道，在监听DOM事件时创建的`MutationObserver`，设置的回调函数就是`mutationBuffer.processMutations`。

`mutationRecord`根据`type`分为3类：

- 文本节点的变化
- 属性的变化
- 子节点的增删

### 文本节点的变化

```js
const value = m.target.textContent;
if (value !== m.oldValue) {
  this.texts.push({
    node: m.target,
    value: value,
  });
}
```

可以看到，文本节点的变化处理比较简单，我们直接将变化后的新值保存在一个`texts`数组中，结构如下：

```
{
  "node": Node,
  "value": "new text content",
}
```

### 属性的变化

```js
const target = m.target
const attrName = m.attributeName
const attrValue = target.getAttribute(attrName)
const oldValue = m.oldValue

let item = this.attributes.find(a => a.node === target)
if (!item) {
  item = {
    node: target,
    attributes: {},
  }
  this.attributes.push(item)
}

if (attrName === 'style') {
  const old = this.doc.createElement('span')
  if (oldValue) {
    old.setAttribute('style', oldValue)
  }
  if (
    item.attributes.style === undefined ||
    item.attributes.style === null
  ) {
    item.attributes.style = {};
  }

  const styleObj = item.attributes.style
  for (const pname of Array.from(target.style)) {
    const newValue = target.style.getPropertyValue(pname);
    const newPriority = target.style.getPropertyPriority(pname);
    if (
      newValue !== old.style.getPropertyValue(pname) ||
      newPriority !== old.style.getPropertyPriority(pname)
    ) {
      if (newPriority === '') {
        styleObj[pname] = newValue;
      } else {
        styleObj[pname] = [newValue, newPriority];
      }
    }
  }
  for (const pname of Array.from(old.style)) {
    if (target.style.getPropertyValue(pname) === '') {  // "if not set, returns the empty string"
      styleObj[pname] = false; // delete
    }
  }
} else {
  // overwrite attribute if the mutations was triggered in same time
  item.attributes[attrName] = transformAttribute(
    this.doc,
    target.tagName,
    attrName,
    attrValue
  )
}
```

处理属性的变化要比处理文本稍微复杂一些，文档中每个属性发生变化的`node`节点都会在`attributes`数组里对应一个对象，该对象用来跟踪该`node`节点上的属性变化，我们把这个对象称为`item`对象。

根据变化的属性名是否为`style`，分为2类处理方式，对于非`style`属性的处理比较简单，如下：

```js
item.attributes[attrName] = transformAttribute(
  this.doc,
  target.tagName,
  attrName,
  attrValue,
)
```

将新的属性值和属性名以键值对的形式保存在`item.attributes`中。

而对于`style`属性，我们通过下面的方式来记录：

```js
item.attributes.style = {
  width: '200px',
  height: ['300px', 'important'],
  'background-color': 'red',
  color: false, // false 代表该属性被删除
}
```

这里值得注意的是，对于被删除的样式属性，会被记录为`name: false`这样的标记。

### 子节点的增删

```js
m.addedNodes.forEach((n) => this.genAdds(n, m.target))
m.removedNodes.forEach((n) => {
  const nodeId = this.mirror.getId(n)
  const parentId = isShadowRoot(m.target) ? this.mirror.getId(m.target.host)
    : this.mirror.getId(m.target)

  // removed node has not been serialized yet, just remove it from the Set
  if (this.addedSet.has(n)) {
    deepDelete(this.addedSet, n)
    this.droppedSet.add(n)
  } else if (this.addedSet.has(m.target) && nodeId === -1) {
    /**
     * If target was newly added and removed child node was
     * not serialized, it means the child node has been removed
     * before callback fired, so we can ignore it because
     * newly added node will be serialized without child nodes.
     * TODO: verify this
     */
  } else if (isAncestorRemoved(m.target, this.mirror)) {
    /**
     * If parent id was not in the mirror map any more, it
     * means the parent node has already been removed. So
     * the node is also removed which we do not need to track
     * and replay.
     */
  } else if (
    this.movedSet.has(n) &&
    this.movedMap[moveKey(nodeId, parentId)]
  ) {
    deepDelete(this.movedSet, n)
  } else {
    this.removes.push({
      parentId,
      id: nodeId,
      isShadow: isShadowRoot(m.target) ? true : undefined,
    })
  }
  this.mapRemoves.push(n)
})
```

可以看到，子节点的增删会用到很多内部数据结构，比如`addedSet`、`droppedSet`、`movedSet`、`removes`、`mapRemoves`，以及映射`movedMap`。
其中，三个集合`addedSet/droppedSet/movedSet`用于处理`MutationObserver`批量触发`MutationRecord`时可能导致的重复统计问题。

最后，将`mutationRecords`处理完之后，这一轮的所有修改都保存在了内部的数据结构里面：

- `texts`数组记录了文本节点的变化
- `attributes`数组记录了节点属性的变化
- `addedSet`记录了新增的未序列化节点
- `droppedSet`记录了删除的未序列化的节点（忽略）
- `movedSet`记录了移动的节点
- `removes/mapRemoves`记录了删除的节点

> 这里要弄清楚`removes`和`mapRemoves`的区别。

接着，我们调用了`emit`方法，如下：

```js
class MutationBuffer {
  public freeze() {
    this.frozen = true;
  }

  public unfreeze() {
    this.frozen = false;
    this.emit();
  }

  public lock() {
    this.locked = true;
  }

  public unlock() {
    this.locked = false;
    this.emit();
  }

  public processMutations = (mutations: mutationRecord[]) => {
    mutations.forEach(this.processMutation)
    this.emit()
  }

  public emit = () => {
    // 省略
  }
}
```

可以看到，除了在处理完一轮`mutationObserver`事件之后调用`emit`外，我们也分别在`unlock/unfreeze`之后调用了`emit`。接下来，就来分析一下这个`emit`做了什么。

```js
function emit() {
  if (this.frozen || this.locked) {
    return
  }

  // 中间的处理过程暂时略过

  const payload = {
    texts: this.texts
      .map((text) => ({
        id: this.mirror.getId(text.node),
        value: text.value,
      }))
      .filter((text) => this.mirror.has(text.id)),
    attributes: this.attributes
      .map((attribute) => ({
        id: this.mirror.getId(attribute.node),
        attributes: attribute.attributes,
      }))
      .filter((attribute) => this.mirror.has(attribute.id)),
    removes: this.removes,
    adds,
  }

  // reset
  this.texts = []
  this.attributes = []
  this.removes = []
  this.addedSet = new Set()
  this.movedSet = new Set()
  this.droppedSet = new Set()
  this.movedMap = {}

  this.emissionCallback(payload)
}
```
可以看到，`emit`就是将所有的 DOM 变化通过 `mutationCb` 传出去。

这就是所有的 DOM 变动情况了。

## 关于lock
在前面的分析中经常会遇到下面这样的代码：
```js
// don't allow any mirror modifications during snapshotting
mutationBuffers.forEach((buf) => buf.lock());
```
这里，我们看到，`buf.lock()`函数内部仅仅是把`this.locked`置为`true`。这有什么效果呢？
正如注释所说，lock 之后，由于不会再调用`emit`方法，所以这期间的所有 DOM 变动都不会修改`mirror`，能够保证在制作快照时不受干扰。
