# record分析

先从整体上看一下`record`的结构：
```js
function record() {}

record.addCustomEvent = (tag, payload) => {}
record.freezePage = () => {}
record.takeFullSnapshot = (isCheckout) => {}
record.mirror = createMirror()

export default record;
```
`record`是核心函数，然后在这个核心函数上挂载了几个额外的函数，然后将这个核心函数`record`导出。


## `record`函数签名
先看下这个函数的签名：
```ts
function record(options: recordOptions): listenerHandler {}
```
参数是`recordOptions`类型，返回值是`listenerHandler`类型，也就是说，调用`record`会开启录制，通过它的返回值来停止录制。

## 流程分析
函数内首先就是对用户传的`options`进行处理，包括赋默认值、检查必填项、整合选项等。
然后定义了一个变量`lastFullSnapshotEvent`用来记录上次全量快照对应的事件对象，以及一个计数器`incrementalSnapshotCount`，用来记录增量快照的事件数。

> (todo): mutationBuffer 分析

然后是定义了一些函数，包括`wrappedEmit`、`wrappedMutationEmit`、`wrappedScrollEmit`、`takeFullSnapshot`，以及`iframeManager`和`shadowDomManager`分别用来处理`iframe`和`shadowDom`。

以上就是一些准备工作，接下来就是正式的核心逻辑了，如下：
```js
try {
  const handlers = []
  handlers.push(
    on('DOMContentLoaded', () => {
      wrappedEmit(
        wrapEvent({
          type: EventType.DomContentLoaded,
          data: {}
        })
      )
    })
  )
  
  const observe = (doc) => {}

  iframeManager.addLoadListener((iframeEl) => {
    handlers.push(observe(iframeEl.contentDocument))
  })

  const init = () => {
    takeFullSnapshot()
    handlers.push(observe(document))
  }

  if (
    document.readyState === 'interactive' ||
    document.readyState === 'complete'
  ) {
    init()
  } else {
    handlers.push(
      on('load', () => {
          wrappedEmit(
            wrapEvent({
              type: EventType.Load,
              data: {},
            }),
          )
          init()
        },
        window,
      )
    )
  }

  return () => {
    handlers.forEach((h) => h())
  }
} catch (error) {
  console.warn(error)
}
```

首先是定义了一个`handlers`容器，容器里面维护了一系列函数对象，用于释放资源及停止录制等，可以看到用`on`监听事件所返回的事件监听器解除操作会被存放在这个容器里面，以及`observe`的返回函数也会被存进该容器。

最后`record`的返回值是一个函数，就是我们前面提到的停止录制的函数，那这个函数是如何将录制停下来的呢？
可以看到，我们只需要将`handlers`中保存的函数给执行一遍即可，我们知道，`handlers`里面保存的函数只有2类，一类是`on`的返回值，用于移除事件监听器，另一类是`observe`的返回值，用于停止监听文档的变化。

## `record`监听的事件
从上面的核心逻辑代码可知，在调用该函数时会监听`document#DOMContentLoaded`事件、`window#load`事件

> 关于 `document.readyState`
> 
> https://developer.mozilla.org/en-US/docs/Web/API/Document/readyState

从`readystatechange`事件的文档可知，上面的代码其实是可以优化的，就是把`DOMContentLoaded`事件的监听放在`load`事件处，这样整理之后不仅优化了逻辑，代码看起来也更清晰了一些：
```js
try {
  const handlers = []
  
  const observe = (doc) => {}
  
  ifameManager.addLoadListener((iframeEl) => {
    handlers.push(observe(iframeEl.contentDocument))
  })
  
  const init = () => {
    takeFullSnapshot()
    handlers.push(observe(document))
  }
  
  if (document.readyState === 'loading') {
    handlers.push(
      on('DOMContentLoaded', () => {
        wrappedEmit(
          wrapEvent({
            type: EventType.DomContentLoaded,
            data: {}
          })
        )
      })
    )
    handlers.push(
      on('load', () => {
        wrappedEmit(
          wrapEvent({
            type: EventType.Load,
            data: {}
          })
        )
        init()
      }, window)
    )
  } else {
    init()
  }
  
  return () => {
    handlers.forEach((h) => h())
  }
} catch (error) {
  console.warn(error)
}
```

## 总结
对上面的代码的分析，我们可以总结一下`record`函数的整体流程：

首先，`record`函数的执行时机分2种情况：

1. 在`html`文档加载的同时去执行`record`函数
2. 在`html`文档加载完成之后再执行`record`函数

第1种情况会监听`DOMContentLoaded`和`load`事件，并在`load`事件之后执行`init`函数；
第2种情况则是直接执行`init`函数。
总而言之就是，最后一定会执行这个`init`函数。

可以这样理解，`record`函数的唯一目的就是执行`init`函数，启动`recorder`来开始记录文档变动事件。

`init`函数如下：
```js
function init() {
  takeFullSnapshot()
  handlers.push(observe(document))
}
```

流程很简单，先对整个文档做一次全量快照，然后通过`observe`函数来持续监听文档后续的变动情况。


## See more

- [takeFullSnapshot](./takeFullSnapshot.md)
- [observe](./observe.md)
