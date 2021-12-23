# pack/unpack 分析

先看签名：
```js
function pack(event: eventWithTime): string {}
function unpack(raw: string): eventWithTime {}
```

`pack`函数用于将`event`数据进行压缩，压缩之后是一个二进制字符串。而`unpack`是它的逆过程，将二进制字符串解压缩成`event`数据。

## 背景知识

### 关于 Binary String

简单来说就是，`ASCII`字符集范围为`[0, 127]`，而`binary string`将这个范围扩展到`[0, 255]`，这样以来一个`binary char`就可以表示一个字节，因此`binary string`就可以表示任意二进制数据了。也就是说，`binary string`的目的并不是为了表示更多字符，而是为了能够表示**二进制数据**。

但是注意，在JavaScript中，所有字符串都是`UTF-16`编码的，我们说的`Binary String`指的是`UTF-16`编码的字符串的每一个码元(code unit)都位于`[0, 255]`这个范围内，码元的高字节为`0x00`。这样的字符串也可以使用`btoa`进行base64编码。

### 示例
1. `'hello world'`字符串就是一个二进制字符串，对应的UTF-16码元如下：
```js
[0x0068, 0x0065, 0x006C, 0x006C, 0x006F, 0x0020, 0x0077, 0x006F, 0x0072, 0x006C, 0x0064]
```
可以看到，每个码元的高位字节都是`0x00`，所以不需要进行处理。

2. `'你好'`不是二进制字符串，但可以转为二进制字符串，对应的UTF-16码元序列如下：
```js
[0x4F60, 0x597D]
```
转为二进制字符串如下：
```js
[0x0060, 0x004F, 0x007D, 0x0059]
```

### 相关函数
```js
/**
 * 将字符串转为字节序列
 * @param str 字符串
 * @param latin1 标识str是二进制字符串，还是UTF-16字符串
 * @return {Uint8Array} 字节序列
 */
function strToU8(str, latin1 = false) {
  if (latin1) {
    // str 是二进制字符串
    const u8 = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      u8[i] = str.charCodeAt(i);
    }
    return u8;
  }
  return new TextEncoder().encode(str);
}

/**
 * 将字节序列转为字符串
 * @param data 字节序列
 * @param latin1 标识该字节序列是否为二进制字符串转换而来的，对应strToU8函数的第二个参数
 * @return {string} 字符串
 */
function strFromU8(data, latin1) {
  if (latin1) {
    let r = '';
    for (let i = 0; i < data.length; i += 16384) {
      // 这里的分片是为了避免调用 String.fromCharCode 时参数过多导致的栈溢出错误
      r += String.fromCharCode.apply(null, data.subarray(i, i + 16384));
    }
    return r;
  } else {
    return new TextDecoder().decode(data);
  }
}
```

### 参考：
- https://developer.mozilla.org/en-US/docs/Web/API/DOMString/Binary
- https://www.ibm.com/docs/en/i/7.3?topic=types-binary-strings


## pack 函数实现
> code/pack.js

```js
function pack(event) {
  // 添加 packer 标记
  const e = {
    ...event,
    v: 'v1',
  };

  // 使用 fflate 库进行处理
  return strFromU8(zlibSync(strToU8(JSON.stringify(e))), true);
}
```

根据上面的代码可知，`pack`函数的流程如下：
1. JSON.stringify 序列化数据
2. 将上一步序列化的字符串转成 UTF-8 字节序列
3. 对字节序列进行 zlib 压缩
4. 对压缩结果再转为 binary string

> 注意：UTF-8 字节序列经过第3步的 zlib 压缩之后，已经不再是一个合法的 UTF-8 序列了，此时如果还按照 UTF-8 转字符串的话，会出现大量的`�`这种字符。这种字符是不可逆的，也就是说，不能将这种字符重新转为对应的字节数据。所以，第4步将字节序列转为二进制字符串是必须的。二进制字符串具有重新转为对应字节数据的这种特性。


## unpack 函数实现
> code/unpack.js

```js
function unpack(raw) {
  try {
    const e = JSON.parse(
      strFromU8(unzlibSync(strToU8(raw, true)))
    );
    if (e.v === MARK) {
      return e;
    }
    throw new Error(
      `These events were packed with packer ${e.v} which is incompatible with current packer ${MARK}.`,
    );
  } catch (error) {
    console.error(error);
    throw new Error('Unknown data format.');
  }
}
```
`unpack`过程就是上面的`pack`函数的逆过程，流程如下：
1. binary string 转为字节序列
2. 对字节序列进行 zlib 解压缩
3. 将解压之后的字节序列转成 UTF-8 字符串
4. JSON.parse 解析字符串

> 第1步中的二进制字符串，即为`pack`函数输出的结果，也是我们存在数据库中的内容。第3步解压缩之后的字节序列就是一个合法的 UTF-8 序列了。
