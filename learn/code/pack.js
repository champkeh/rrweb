const {inspectU16Str, inspectStr, toBinaryString } = require('./utils')
const {zlibSync} = require('fflate')
// const data = require('./data')
const data = '☸☹☺☻☼☾☿'

// 'x��0�H�Q6]>�
//             y�%��ed��o�'
// 'x  0»HýQ6]> 
//             yò%¥¤edã½oº'



console.log(inspectU16Str('hello world'));

// console.log(inspectString('你好'));
// console.log(inspectString('hello world'));

// console.log(inspectStr('你好'));
// console.log(inspectU8Str('你好'));
// console.log(strToU8('hello', true));
// console.log(strToU8('hello', false));
// console.log(strFromU8(strToU8('hello', true), false));


function inspect(data) {
  console.log('++++++++++++++++++');
  console.log('data: ', data);
  console.log('length: ', data.length);
  console.log('bytes: ', inspectStr(data));
  console.log('------------------');
  console.log();
}

const testStr = '🐶👍\u{E004A}'

inspect(testStr);
inspect(toBinaryString(testStr));
inspect(toBinaryString(toBinaryString(testStr)));
