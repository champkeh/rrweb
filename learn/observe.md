# observe分析

我们前面已经知道，`observe`函数的目的就是监听文档的后续变动情况。位于`takeFullSnapshot`之后进行调用。

> 与`takeFullSnapshot`类似的是，`observe`也是在`record`函数内部进行定义的。与`takeFullSnapshot`不同的是，`observe`不需要暴露给外部使用，整个record流程也只需要调用一次，所以没有挂载到`record`函数上。

下面，我们就一步一步来分析一下`observe`是如何监听文档变动的：

同样，先看签名：
```js
function observe(doc: Document): listenerHandler {}
```
通过签名可以知道，`observe`函数将监听传递给它的`document`对象，然后返回一个停止监听的函数。

下面是`observe`的完整代码：
```js
function observe(doc) {
  return initObservers(
    {
      mutationCb: (m) => {
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.Mutation,
              ...m,
            },
          }),
        );
      },
      mousemoveCb: (positions, source) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source,
              positions,
            },
          }),
        ),
      mouseInteractionCb: (d) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.MouseInteraction,
              ...d,
            },
          }),
        ),
      scrollCb: (pos) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.Scroll,
              ...pos,
            },
          }),
        ),
      viewportResizeCb: (d) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.ViewportResize,
              ...d,
            },
          }),
        ),
      inputCb: (v) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.Input,
              ...v,
            },
          }),
        ),
      mediaInteractionCb: (p) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.MediaInteraction,
              ...p,
            },
          }),
        ),
      styleSheetRuleCb: (r) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.StyleSheetRule,
              ...r,
            },
          }),
        ),
      styleDeclarationCb: (r) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.StyleDeclaration,
              ...r,
            },
          }),
        ),
      canvasMutationCb: (p) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.CanvasMutation,
              ...p,
            },
          }),
        ),
      fontCb: (p) =>
        wrappedEmit(
          wrapEvent({
            type: EventType.IncrementalSnapshot,
            data: {
              source: IncrementalSource.Font,
              ...p,
            },
          }),
        ),
      blockClass,
      ignoreClass,
      maskTextClass,
      maskTextSelector,
      maskInputOptions,
      inlineStylesheet,
      sampling,
      recordCanvas,
      userTriggeredOnInput,
      collectFonts,
      doc,
      maskInputFn,
      maskTextFn,
      blockSelector,
      slimDOMOptions,
      mirror,
      iframeManager,
      shadowDomManager,
      plugins: 
        plugins?.map((p) => ({
          observer: p.observer,
          options: p.options,
          callback: (payload: object) =>
            wrappedEmit(
              wrapEvent({
                type: EventType.Plugin,
                data: {
                  plugin: p.name,
                  payload,
                },
              }),
            ),
        })) || [],
    },
    hooks,
  )
}
```
虽然这个函数很长，但其实逻辑很简单，只是需要考虑的资源类别较多而已。
可以看到，`observe`内部调用`initObservers`函数并直接返回，所以核心还是在`initObservers`这个函数上。

## 函数签名
`initObservers`这个函数的签名如下：
```ts
function initObservers(
  o: observerParam,
  hooks: hooksParam = {},
): listenerHandler {}
```
接受2个参数，`hooks`参数我们就不多说了，直接就是将我们传给`record`函数的选项透传给`initObservers`，包括第一个参数里面的大部分选项也都是透传的。
第一个参数除了那些透传的选项外，剩下的就是各种回调函数，如下：

| 回调                 | 作用         | EventType           | Source           |
|:-------------------|:-----------|---------------------|------------------|
| mutationCb         | 监听dom变动    | IncrementalSnapshot | Mutation         |
| mousemoveCb        | 监听鼠标移动     | IncrementalSnapshot | xxx              |
| mouseInteractionCb | 监听鼠标交互     | IncrementalSnapshot | MouseInteraction |
| scrollCb           | 监听滚动       | IncrementalSnapshot | Scroll           |
| viewportResizeCb   | 监听视口变化     | IncrementalSnapshot | ViewportResize   |
| inputCb            | 监听输入       | IncrementalSnapshot | Input            |
| mediaInteractionCb | 监听媒体交互     | IncrementalSnapshot | MediaInteraction |
| styleSheetRuleCb   | 监听样式表规则变动  | IncrementalSnapshot | StyleSheetRule   |
| styleDeclarationCb | 监听样式声明变动   | IncrementalSnapshot | StyleDeclaration |
| canvasMutationCb   | 监听canvas变动 | IncrementalSnapshot | CanvasMutation   |
| fontCb             | 监听字体变化     | IncrementalSnapshot | Font             |

可以看到，`initObservers`监听的内容还是比较全的。包括dom变化、鼠标运动及交互、滚动事件、视口大小变化事件、输入事件、媒体交互事件、样式变动事件、字体变动、canvas变动等。
返回值是一个函数，调用该函数即可停止监听。

下面就分析下这个函数是如何工作的：
```js
// basically document.window
const currentWindow = o.doc.defaultView;
if (!currentWindow) {
  return () => {};
}

mergeHooks(o, hooks);
```
这部分主要是调用`mergeHooks`将`hooks`中的钩子合并到对应监视代码里面，代码如下：
```js
function mergeHooks(o, hooks) {
  const {
    mutationCb,
    mousemoveCb,
    // ...,
  } = o;
  
  o.mutationCb = (...p) => {
    if (hooks.mutation) {
      hooks.mutation(...p)
    }
    mutationCb(...p)
  }
  o.mousemoveCb = (...p) => {
    if (hooks.mousemove) {
      hooks.mousemove(...p)
    }
    mousemoveCb(...p)
  }
  // ...
}
```
可以看到，我们将`hooks`中的钩子插入到`o`中对应函数之前。我们又从上面的代码中知道，`o`中的所有相关回调其实只做了一件事，就是发射对应事件，就像下面这样的代码：
```js
{
  mutationCb: () => {
    wrappedEmit(
      wrapEvent({
        type: EventType.IncrementalSnapshot,
        data: {}
      })
    )
  }
}
```
因此，我们可以把`observer`看做是事件收集器，收集页面上的各种事件并发射出去。至于它是怎么收集的，下面我们一个一个进行分析。

> 目前共有11个`observer`，见上面的表格。

## DOM事件收集器：initMutationObserver
这个`observer`用于监听DOM变动，代码如下：
```js
function initMutationObserver() {
  const mutationBuffer = new MutationBuffer();
  mutationBuffers.push(mutationBuffer);
  mutationBuffer.init();

  const observer = new MutationObserver(
    mutationBuffer.processMutations.bind(mutationBuffer),
  );
  observer.observe(rootEl, {
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  });
  return observer;
}
```
首先是初始化了一个`mutationBuffer`，如下：
```js
const mutationBuffer = new MutationBuffer()
mutationBuffers.push(mutationBuffer)
mutationBuffer.init()
```

然后创建一个`MutationObserver`来监听DOM变化：
```js
const observer = new MutationObserver(
  mutationBuffer.processMutations.bind(mutationBuffer)
)
observer.observe(rootEl, {
  attributes: true,
  attributeOldValue: true,
  characterData: true,
  characterDataOldValue: true,
  childList: true,
  subtree: true,
})
```
可以看到，`MutationObserver`的回调设置为新创建的`mutationBuffer.processMutations`方法，`rootEl`参数为传进来的`document`。至于具体的 DOM 变动处理，可以查看`MutationBuffer`内部的实现。

## 鼠标移动：initMoveObserver
```js
function initMoveObserver(cb, sampling, doc, mirror) {
  const handlers = [
    on('mousemove', updatePosition, doc),
    on('touchmove', updatePosition, doc),
    on('drag', updatePosition, doc),
  ];
  return () => {
    handlers.forEach((h) => h());
  };
}
```
鼠标的移动是通过在`document`上绑定`mousemove/touchmove/drag`这三个事件来实现的。

## 鼠标交互：initMouseInteractionObserver
```js
function initMouseInteractionObserver(cb, doc, mirror, blockClass) {
  
}
```

## initScrollObserver

## initViewportResizeObserver

## initInputObserver

## initMediaInteractionObserver

## initStyleSheetObserver

## initStyleDeclarationObserver

## initCanvasMutationObserver

## initFontObserver
