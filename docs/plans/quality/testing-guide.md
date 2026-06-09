# 自动化测试指南

本文档介绍如何运行和编写小梦语音助手的自动化测试。
## 测试框架

- **Jest** - JavaScript 测试框架
- **Supertest** - HTTP 断言库（用于 API 测试）

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 只运行单元测试
npm run test:unit

# 只运行集成测试
npm run test:integration

# 运行配置测试
npm run test:config
```

## 测试结构

```
tests/
├── setup.js                 # 测试设置文件
├── unit/                # 单元测试
│   ├── config.test.js       # 配置模块测试
│   ├── textProcessor.test.js # 文本处理测试
│   └── ...
├── integration/             # 集成测试
│   ├── health.test.js       # 健康检查 API 测试
│   └── ...
└── fixtures/                # 测试数据
    └── ...
```

## 编写测试

### 单元测试示例

```javascript
/**
 * 单元测试 - 测试单个函数或模块
 */
describe('模块名称', () => {
  describe('函数名称', () => {
    test('应该做什么', () => {
      // Arrange - 准备测试数据
      const input = 'test';

      // Act - 执行被测试的函数
      const result = someFunction(input);

      // Assert - 断言结果
      expect(result).toBe('expected');
    });

    test('应该处理边界情况', () => {
      expect(someFunction(null)).toBe('');
      expect(someFunction(undefined)).toBe('');
      expect(someFunction('')).toBe('');
    });
  });
});
```

### 集成测试示例

```javascript
/**
 * 集成测试 - 测试多个模块协作
 */
const request = require('supertest');
const app = require('../server');

describe('API 端点测试', () => {
  test('GET /api/endpoint 应该返回 200', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toHaveProperty('data');
  });

  test('POST /api/endpoint 应该创建资源', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .send({ name: 'test' })
      .expect(201);

    expect(response.body.name).toBe('test');
  });
});
```

## Jest 配置

配置文件：`jest.config.js`

### 关键配置项

| 配置项 | 说明 | 值 |
|--------|------|-----|
| `testEnvironment` | 测试环境 | `node` |
| `testMatch` | 测试文件匹配模式 | `**/*.test.js`, `**/*.spec.js` |
| `collectCoverageFrom` | 覆盖率收集范围 | `controllers/`, `services/`, `utils/`, `config/` |
| `coverageThreshold` | 覆盖率阈值 | 50% |
| `testTimeout` | 测试超时 | 10000ms |

### 覆盖率阈值

当前设置的最低覆盖率要求：
- 分支覆盖率：50%
- 函数覆盖率：50%
- 行覆盖率：50%
- 语句覆盖率：50%

## 常用断言

### 基本断言

```javascript
// 相等性
expect(value).toBe(expected);           // 严格相等 ===
expect(value).toEqual(expected);        // 深度相等
expect(value).not.toBe(expected);       // 不相等

// 真值
expect(value).toBeTruthy();             // 真值
expect(value).toBeFalsy();              // 假值
expect(value).toBeNull();               // null
expect(value).toBeUndefined();          // undefined
expect(value).toBeDefined();            // 已定义

// 数字
expect(value).toBeGreaterThan(3);       // > 3
expect(value).toBeGreaterThanOrEqual(3);// >= 3
expect(value).toBeLessThan(5);          // < 5
expect(value).toBeLessThanOrEqual(5);   // <= 5
expect(value).toBeCloseTo(0.3);     // 浮点数近似

// 字符串
expect(string).toMatch(/pattern/);      // 正则匹配
expect(string).toContain('substring');  // 包含子串

// 数组/可迭代对象
expect(array).toContain(item);          // 包含元素
expect(array).toHaveLength(3);          // 长度为 3

// 对象
expect(object).toHaveProperty('key');   // 有属性
expect(object).toHaveProperty('key', value); // 属性值
expect(object).toMatchObject({          // 部分匹配
  key: 'value'
});

// 异常
expect(() => {
  throw new Error('error');
}).toThrow();                // 抛出异常
expect(() => {
  throw new Error('error');
}).toThrow('error');                    // 抛出特定异常

// 异步
await expect(promise).resolves.toBe(value);  // Promise resolve
await expect(promise).rejects.toThrow();     // Promise reject
```

### HTTP 断言（Supertest）

```javascript
const response = await request(app)
  .get('/api/endpoint')
  .expect(200)                      // 状态码
  .expect('Content-Type', /json/)       // 响应头
  .expect((res) => {                    // 自定义断言
    expect(res.body.data).toBeDefined();
  });
```

## Mock 和 Spy

### Mock 函数

```javascript
// 创建 mock 函数
const mockFn = jest.fn();
mockFn.mockReturnValue('mocked');
mockFn.mockResolvedValue('async mocked');

// 断言调用
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
```

### Mock 模块

```javascript
// Mock 整个模块
jest.mock('../services/llm_service');

// Mock 特定函数
jest.mock('../services/llm_service', () => ({
  generateReply: jest.fn().mockResolvedValue('mocked reply')
}));

// 恢复原始实现
jest.unmock('../services/llm_service');
```
### Spy

```javascript
// 监听对象方法
const spy = jest.spyOn(object, 'method');
spy.mockReturnValue('mocked');

// 恢复原始实现
spy.mockRestore();
```

## 测试生命周期

```javascript
// 所有测试前执行一次
beforeAll(() => {
  // 设置测试环境
});

// 每个测试前执行
beforeEach(() => {
  // 重置状态
});

// 每个测试后执行
afterEach(() => {
  // 清理
});

// 所有测试后执行一次
afterAll(() => {
  // 清理资源
});
```

## 测试覆盖率

### 查看覆盖率报告

```bash
# 生成覆盖率报告
npm run test:coverage

# 报告位置
coverage/
├── lcov-report/
│   └── index.html    # HTML 报告（在浏览器中打开）
└── lcov.info         # LCOV 格式（用于 CI）
```

### 覆盖率指标

- **Statements** - 语句覆盖率
- **Branches** - 分支覆盖率
- **Functions** - 函数覆盖率
- **Lines** - 行覆盖率

## 最佳实践

### 1. 测试命名

```javascript
// ✅ 好的命名 - 描述性强
test('应该在用户未登录时返回 401', () => {});

// ❌ 差的命名 - 不够描述性
test('test1', () => {});
```

### 2. 测试独立性

```javascript
// ✅ 每个测试独立
test('测试 A', () => {
  const data = createTestData();
  // 测试逻辑
});

test('测试 B', () => {
  const data = createTestData();
  // 测试逻辑
});

// ❌ 测试之间有依赖
let sharedData;
test('测试 A', () => {
  sharedData = createTestData();
});
test('测试 B', () => {
  // 依赖测试 A 的 sharedData
});
```

### 3. 测试边界情况

```javascript
test('应该处理各种输入', () => {
  // 正常情况
  expect(fn('normal')).toBe('result');

  // 边界情况
  expect(fn('')).toBe('');
  expect(fn(null)).toBe('');
  expect(fn(undefined)).toBe('');

  // 异常情况
  expect(() => fn(invalid)).toThrow();
});
```

### 4. 使用 describe 分组

```javascript
describe('UserService', () => {
  describe('createUser', () => {
    test('应该创建新用户', () => {});
    test('应该验证邮箱格式', () => {});
  });

  describe('deleteUser', () => {
    test('应该删除存在的用户', () => {});
    test('应该在用户不存在时抛出错误', () => {});
  });
});
```

### 5. 避免测试实现细节

```javascript
// ✅ 测试行为
test('应该返回用户列表', async () => {
  const users = await getUsers();
  expect(users).toHaveLength(3);
  expect(users[0]).toHaveProperty('name');
});

// ❌ 测试实现
test('应该调用 database.query', async () => {
  const spy = jest.spyOn(database, 'query');
  await getUsers();
  expect(spy).toHaveBeenCalled();
});
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
    - uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

## 故障排查

### 测试超时

```javascript
// 增加特定测试的超时时间
test('长时间运行的测试', async () => {
  // 测试逻辑
}, 30000); // 30 秒

// 或在 describe 级别设置
describe('慢速测试套件', () => {
  jest.setTimeout(30000);
  // 测试...
});
```

### Mock 不生效

```javascript
// 确保在导入模块前 mock
jest.mock('../module');
const module = require('../module');

// 清除 mock
beforeEach(() => {
  jest.clearAllMocks();
});
```

### 异步测试失败

```javascript
// ✅ 使用 async/await
test('异步测试', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});

// ✅ 返回 Promise
test('异步测试', () => {
  return asyncFunction().then(result => {
    expect(result).toBe('expected');
  });
});

// ❌ 忘记 await 或 return
test('异步测试', () => {
  asyncFunction().then(result => {
    expect(result).toBe('expected');
  });
});
```

## 参考资源

- [Jest 官方文档](https://jestjs.io/)
- [Supertest 文档](https://github.com/visionmedia/supertest)
- [测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
