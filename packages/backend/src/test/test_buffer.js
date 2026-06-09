/**
 * @file test_buffer.js
 * @description 测试 Buffer.alloc 的默认行为，验证新分配的缓冲区是否全零填充
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** @constant {number} BUFFER_SIZE - 测试缓冲区大小（字节） */
const BUFFER_SIZE = 10;

const buf = Buffer.alloc(BUFFER_SIZE);
console.log('Buffer.alloc(10):', buf);

// 检查是否全零，Buffer.alloc 默认用零填充，与 Buffer.allocUnsafe 不同
const allZero = buf.every(b => b === 0);
console.log('是否全零:', allZero);
