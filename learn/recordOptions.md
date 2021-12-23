## 解析 `snapshot` 函数的选项
`snapshot`函数的签名如下：
```typescript
function snapshot(
  n: Document, 
  options: {
    blockClass?: string | RegExp;
    blockSelector?: string | null;
    maskTextClass?: string | RegExp;
    maskTextSelector?: string | null;
    inlineStylesheet?: boolean;
    maskAllInputs?: boolean | MaskInputOptions;
    maskTextFn?: MaskTextFn;
    maskInputFn?: MaskTextFn;
    slimDOM?: boolean | SlimDOMOptions;
    recordCanvas?: boolean;
    preserveWhiteSpace?: boolean;
    onSerialize?: (n: INode) => unknown;
    onIframeLoad?: (iframeINode: INode, node: serializedNodeWithId) => unknown;
    iframeLoadTimeout?: number;
    keepIframeSrcFn?: KeepIframeSrcFn;
  }
): [serializedNodeWithId | null, idNodeMap] {
  
}
```

- maskAllInputs  
用于处理页面中的输入框内容是否需要脱敏。有3种取值方式，`true`表示所有类型的输入框内容都需要脱敏，`false`表示只脱敏密码框的内容，另外就是对象形式，可以自定义需要脱敏的输入框类型。
至于具体如何脱敏，那就要看下面这个参数了。
- maskTextFn/maskInputFn  
这是一个脱敏函数，可以由用户自定义，也可以使用内置的脱敏方法。

### 1. maskTextXXX
```typescript
function snapshot(
  n: Document,
  options: {
    maskTextClass?: string | RegExp;
    maskTextSelector?: string | null;
    maskTextFn?: MaskTextFn;
  }
)
```

`maskTextClass`和`maskTextSelector`这两个选项用于对页面上的敏感内容(文本)进行脱敏，比如用户的手机号和身份信息等，这些内容一般都是`span`或者`p`标签中的文本内容。
这两个选项的目的都是一样的，只不过是两种不同的选择元素的方式：`maskTextClass`可以指定一个类名，或者通过正则表达式指定一类类名;`maskTextSelector`可以使用css里面的选择器语法。这两个选项可以同时使用，效果是`或`的关系。

> 页面中的所有文本节点都会执行这种检查，也就是源码中的`needMaskingText`函数，如果匹配不上，则会一直向上查找，直到查到根节点仍然不匹配，才不会执行内容脱敏。(此处应该是有优化空间的)

脱敏的效果是通过`maskTextFn`函数来定义，如果不指定，则采用内置的脱敏函数，如下：
```js
function maskTextFn(textContent) {
  // 将所有非空白字符都替换为 *
  return textContent.replace(/[\S]/g, '*');
}
```


### 2. maskInputXXX
上面是文本的脱敏，接下来我们再看一下输入框的脱敏。

```typescript
import { MaskInputOptions } from 'rrweb-snapshot';

function snapshot(
  n: Document,
  options: {
    maskAllInputs?: boolean | MaskInputOptions;
    maskInputFn?: MaskTextFn;
  }
)
```
`maskAllInputs`用于选择哪些类型的输入框需要脱敏，作用等价于`maskTextClass/maskTextSelector`，脱敏效果通过`maskInputFn`函数定义。
与文本脱敏不同的是，输入框的脱敏是按照输入框类型来指定的，你可以指定哪些类型的输入框需要脱敏，而不能指定哪一个输入框需要脱敏，也就是说，可选择的粒度变大了。

> 页面中的所有`input`、`textarea`、`select`元素都会调用`maskInputValue`函数进行检查，这些标签名和`input`的`type`一起组成一个配置对象，来决定哪些类型的输入框需要进行脱敏处理。

默认的`maskInputFn`是这样的：
```js
function maskInputFn(value) {
  return '*'.repeat(value.length);
}
```

### 3. blockXXX
讲完脱敏之后，我们在来看`block`。

```typescript
function snapshot(
  n: Document,
  options: {
    blockClass?: string | RegExp;
    blockSelector?: string | null;
  }
)
```
这两个选项与`maskTextXxx`类似，都是用于选择元素的方式。选中的元素都会被标记为`needBlock`。被标记为`needBlock`的元素会有两个额外属性：`rr_width`和`rr_height`，属性值为对应元素的尺寸。被`block`的元素，不再序列化其子元素。这样的元素在播放的时候，会用特殊的标记显示。

block的使用场景：

- 比如vconsole生成的节点 


