/**
 * 查看字符串的UTF-16表示
 * @param str
 * @return {ArrayBufferLike}
 */
function inspectU16Str(str) {
  const codeUnits = new Uint16Array(str.length);
  for (let i = 0; i < codeUnits.length; i++) {
    codeUnits[i] = str.charCodeAt(i)
  }
  return codeUnits.buffer
}

/**
 * 查看字符串的UTF-8表示
 * @param str
 * @return {ArrayBufferLike}
 */
function inspectU8Str(str) {
  return new TextEncoder().encode(str).buffer
}

/**
 * 查看JS字符串的内部表示
 * @param str
 * @return {ArrayBufferLike}
 */
function inspectStr(str) {
  return inspectU16Str(str)
}

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

/**
 * 将一个字符串转为二进制字符串
 * @param string
 * @return {string}
 */
function toBinaryString(string) {
  const codeUnits = new Uint16Array(string.length);
  for (let i = 0; i < codeUnits.length; i++) {
    codeUnits[i] = string.charCodeAt(i);
  }
  const charCodes = new Uint8Array(codeUnits.buffer);
  let result = '';
  for (let i = 0; i < charCodes.byteLength; i++) {
    result += String.fromCharCode(charCodes[i]);
  }
  return result;
}

/**
 * 从二进制字符串还原为原字符串
 * @param binary
 * @return {string}
 */
function fromBinaryString(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const charCodes = new Uint16Array(bytes.buffer);
  let result = '';
  for (let i = 0; i < charCodes.length; i++) {
    result += String.fromCharCode(charCodes[i]);
  }
  return result;
}

module.exports = {
  inspectU16Str,
  inspectU8Str,
  inspectStr,
  strToU8,
  strFromU8,
  toBinaryString,
  fromBinaryString,
}
