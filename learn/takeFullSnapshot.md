# takeFullSnapshot分析

`takeFullSnapshot`有2个定义，一个是在`record`函数内部定义的`takeFullSnapshot`函数，另一个是挂载在`record`函数上的`record.takeFullSnapshot`函数。我们可以把`record.takeFullSnapshot`当作是访问内部`takeFullSnapshot`函数的包装器。

下面就开始分析内部`takeFullSnapshot`函数的流程：

先看函数签名：
```js
function takeFullSnapshot(isCheckout = false) {}
```

顾名思义，函数`takeFullSnapshot`就是对文档做全量快照的。

首先是发射一个`Meta`事件，标志着全量快照的开始，如下：
```js
wrappedEmit(
  wrapEvent({
    type: EventType.Meta,
    data: {
      href: window.location.href,
      width: getWindowWidth(),
      height: getWindowHeight(),
    },
  }),
  isCheckout,
);
```
从上面的代码我们可以知道，`Meta`事件会记录在制作全量快照时，当前文档的`href`路径，以及当前窗口大小。

---

> 这里涉及到另外两个函数：`wrappedEmit`和`wrapEvent`，这两个函数的组合在源码里是很常见的，我们简单介绍下这两个函数。

### wrapEvent
`wrapEvent`函数很简单，只是给事件对象添加时间戳，如下：
```js
function wrapEvent(e: event): eventWithTime {
  return {
    ...e,
    timestamp: Date.now(),
  };
}
```
其实我感觉这个函数名不太好，从名字完全看不出这个函数是要干啥，我觉得应该叫`wrapEventWithTime`。

### wrappedEmit
另一个函数`wrappedEmit`比较重要，它的名字相比`wrapEvent`就要好很多，就是对用户传给`record`的`emit`函数选项的包装，代码如下：
```js
function wrappedEmit(eventWithTime, isCheckout) {
  if (
    mutationBuffers[0]?.isFrozen() &&
    eventWithTime.type !== EventType.FullSnapshot &&
    !(
      eventWithTime.type === EventType.IncrementalSnapshot &&
      eventWithTime.data.source === IncrementalSource.Mutation
    )
  ) {
    // we've got a user initiated event so first we need to apply
    // all DOM changes that have been buffering during paused state
    mutationBuffers.forEach((buf) => buf.unfreeze());
  }

  emit((packFn ? packFn(eventWithTime) : eventWithTime), isCheckout);

  if (eventWithTime.type === EventType.FullSnapshot) {
    lastFullSnapshotEvent = eventWithTime;
    incrementalSnapshotCount = 0;
  } else if (eventWithTime.type === EventType.IncrementalSnapshot) {
    // attach iframe should be considered as full snapshot
    if (
      eventWithTime.data.source === IncrementalSource.Mutation &&
      eventWithTime.data.isAttachIframe
    ) {
      return;
    }

    incrementalSnapshotCount++;
    const exceedCount =
      checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth;
    const exceedTime =
      checkoutEveryNms &&
      eventWithTime.timestamp - lastFullSnapshotEvent.timestamp > checkoutEveryNms;
    if (exceedCount || exceedTime) {
      takeFullSnapshot(true);
    }
  }
}
```
这个函数的逻辑可以分成3个部分：
1. 第一个部分处理页面的冻结（这个后续单独分析 [mutationBuffer](./mutationBuffer.md)）
2. 第二部分调用`emit`函数并把事件数据传出去
3. 第三部分处理`checkoutEveryNth`和`checkoutEveryNms`这两个选项

这两个选项分别用于每N个增量事件/每N毫秒进行一次全量快照。

> 从这里也可以看出来`checkoutEveryNms`会存在的一些问题。
> 这个选项的本意是每隔N毫秒进行一次全量快照，但是由于只有在调用`wrappedEmit`函数的时候才会去检查是否达到了这个条件，所以就会出现一种情况就是，如果一直没有触发新的事件，`wrappedEmit`函数就一直得不到调用，这种检查就不会发生，因此也就不会定期进行全量快照，最终的效果就是，尽管你指定了每隔1000毫秒进行一次全量快照，但如果页面一直没有产生新的事件，那么并不会进行任何全量快照。

需要注意的是，我们传递给`record`的`emit`选项，只有这个函数有引用。也就是说，在整个record的过程中我们都是使用`wrappedEmit`函数去发射事件。

---

接着回到`takeFullSnapshot`函数，发射完`Meta`事件之后，紧接着就锁住`mutationBuffer`，如下：
```js
// don't allow any mirror modifications during snapshotting
mutationBuffers.forEach((buf) => buf.lock());
```
> 关于`mutationBuffer`的细节，后面再单独进行分析。
> [mutationBuffer](./mutationBuffer.md)

然后就是使用`rrweb-snapshot`这个序列化库对整个文档进行序列化，如下：
```js
const [node, idNodeMap] = snapshot(document, {
  blockClass,
  blockSelector,
  maskTextClass,
  maskTextSelector,
  inlineStylesheet,
  maskAllInputs: maskInputOptions,
  maskTextFn,
  slimDOM: slimDOMOptions,
  recordCanvas,
  onSerialize: (n) => {
    if (isIframeINode(n)) {
      iframeManager.addIframe(n);
    }
    if (hasShadowRoot(n)) {
      shadowDomManager.addShadowRoot(n.shadowRoot, document);
    }
  },
  onIframeLoad: (iframe, childSn) => {
    iframeManager.attachIframe(iframe, childSn);
  },
  keepIframeSrcFn,
});
if (!node) {
  return console.warn('Failed to snapshot the document');
}
```
如果序列化结果`node`为空表示序列化失败了，就退出`takeFullSnapshot`函数。

然后，我们把这次全量快照对应的序列化map给保存起来，放在`mirror`中。
```js
mirror.map = idNodeMap;
```

> 关于`mirror`的细节，我们也放在后面单独分析。
> [mirror](./mirror.md)

最后，再发射一个`FullSnapshot`事件，表示全量快照制作完毕，将序列化结果保存在事件的`data`属性中。这里我们又看到了我们的老朋友——`wrappedEmit/wrapEvent`组合。
```js
wrappedEmit(
  wrapEvent({
    type: EventType.FullSnapshot,
    data: {
      node,
      initialOffset: {
        left:
          window.pageXOffset !== undefined
            ? window.pageXOffset
            : document?.documentElement.scrollLeft ||
              document?.body?.parentElement?.scrollLeft ||
              document?.body.scrollLeft ||
              0,
        top:
          window.pageYOffset !== undefined
            ? window.pageYOffset
            : document?.documentElement.scrollTop ||
              document?.body?.parentElement?.scrollTop ||
              document?.body.scrollTop ||
              0,
      },
    },
  }),
);
```

最最后，我们解锁`mutationBuffer`：
```js
// generate & emit any mutations that happened during snapshotting, as can now apply against the newly built mirror
mutationBuffers.forEach((buf) => buf.unlock());
```


## 总结

我们总结一下`takeFullSnapshot`的整个流程：
1. 发射`Meta`事件，表示开始进行全量快照
2. 锁住`mutationBuffer`
3. 序列化`document`
4. 发射`FullSnapshot`事件，表示全量快照完成
5. 解锁`mutationBuffer`


最后，我们再来说下`takeFullSnapshot`的调用时机。这个函数一共分两种调用时机：`observe`之前和`observe`之后。
`observe`之前调用是在启动的时候写死的，先进行一次全量快照，然后在监视文档变化。而`observe`之后的调用，分为`checkoutEveryNxx`选项导致和手动调用两种情况。

这两个执行时机有一些明显的区别：
- `observe`之前，`mutationBuffers`数组为空，所以在制作全量快照时不需要考虑文档的冻结
- `observe`之后，`mutationBuffers`已经有数据了，这时候制作全量快照就需要先锁住文档
