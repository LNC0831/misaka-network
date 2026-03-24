# 12C: Secure Streaming + File Transfer + Visible Progress

## Goal

Build a **complete secure task execution pipeline** between agents:

```
Agent A → Agent B (全程加密、签名、可验证):

  发现: noise 加密 P2P 通道发现对方
  委托: A2A over HTTPS 发送任务
  执行: B 流式回传进度、中间结果、最终文件
  验证: 每个 artifact 和 status 都可用 DID:key 验签
```

这不只是"功能特性"——安全和传输是一体的。

## Depends on

- ✅ 12B (A2A SDK migration) — SDK 已接入，支持 Task 生命周期和 SSE

## 三个能力

### 1. 可见进度 (Status Streaming)

Agent 执行任务时，委托方能**实时看到**进度：

```
submitted → working (30%) → working (80%) → completed
```

SDK 的 Task 状态机：
```
submitted → working → completed
                   → failed
                   → canceled
         → input-required → working → ...
```

每个 status-update 包含:
- `state`: 当前状态
- `timestamp`: 时间戳
- `message`: 可选的进度描述 (如 "Analyzing input...", "80% complete")

### 2. 文件传输 (Artifacts)

Agent 之间能传输**三种类型**的数据：

| Part 类型 | 格式 | 用途 |
|-----------|------|------|
| `text` | `{ kind: 'text', text: string }` | 自然语言结果、代码片段 |
| `file` | `{ kind: 'file', file: { name, mimeType, bytes } }` | 二进制文件 (图片、PDF、编译产物)。bytes 为 base64 编码 |
| `data` | `{ kind: 'data', data: object }` | 结构化 JSON (指标、配置、中间计算结果) |

一个 Task 可以有**多个 Artifact**，每个 Artifact 有名字和多个 Part。

### 3. 流式传输 (SSE Streaming)

委托方不需要等任务完成才收到响应——通过 Server-Sent Events 实时接收：

```
A ──[message/stream]──→ B
A ←──[SSE event]─────── B: { kind: 'task', status: 'submitted' }
A ←──[SSE event]─────── B: { kind: 'status-update', state: 'working', message: '30%' }
A ←──[SSE event]─────── B: { kind: 'artifact-update', name: 'partial.json' }
A ←──[SSE event]─────── B: { kind: 'status-update', state: 'working', message: '80%' }
A ←──[SSE event]─────── B: { kind: 'artifact-update', name: 'report.pdf' }
A ←──[SSE event]─────── B: { kind: 'status-update', state: 'completed', final: true }
```

## 安全贯穿全链路

| 环节 | 安全机制 | 已有？ |
|------|---------|--------|
| P2P 发现 | noise 协议加密 + yamux 多路复用 | ✅ |
| 身份验证 | DID:key (公钥即身份，自证明) | ✅ |
| A2A 通信 | HTTPS / TLS (生产环境) | ✅ |
| Artifact 签名 | DID:key Ed25519 签名（每个 artifact 可验签） | ❌ 待实现 |
| 端到端加密 | 可选：用对方 DID 的公钥加密 artifact | ❌ 远期 |

### Artifact 签名方案

每个 artifact 附加发送方的 DID 签名：

```javascript
// 发送方 (executor 内部自动完成)
const artifact = { name: 'result.json', parts: [...] }
const signature = await identity.sign(JSON.stringify(artifact))
// artifact.__signature = toBase64Url(signature)
// artifact.__signer = identity.did

// 接收方验证
const valid = await Identity.verifyFromDid(
  artifact.__signer,            // did:key:z6Mk...
  JSON.stringify(artifact),     // 原始数据
  fromBase64Url(artifact.__signature)
)
// valid === true → artifact 确实来自该 DID 的持有者
```

## API 设计

### Executor 接口 (新)

```javascript
const node = new MisakaNode({
  // 新: executor 第二个参数是 eventBus
  executor: async ({ taskId, input, message }, eventBus) => {

    // 报告进度
    eventBus.status('working', 'Analyzing input...')

    // ... 执行工作 ...

    // 发送中间结果 (结构化数据)
    eventBus.artifact('analysis', [
      { kind: 'data', data: { progress: 50, tokens: 1234 } }
    ])

    // ... 更多工作 ...

    // 发送最终文件
    eventBus.artifact('report', [
      { kind: 'file', file: { name: 'report.pdf', mimeType: 'application/pdf', bytes: base64Data } }
    ])

    // 返回文本摘要 (兼容旧 API)
    return 'Analysis complete. See attached report.'
  }
})
```

### 向后兼容

旧 executor 不受影响：

```javascript
// 旧写法 — 依然有效
executor: async ({ input }) => 'response string'

// 新写法 — 可选使用 eventBus
executor: async ({ input }, eventBus) => {
  if (eventBus) eventBus.status('working', '50%')
  return 'response string'
}
```

判断逻辑：如果 executor 函数的 `.length >= 2`，说明接受 eventBus 参数，使用 Task 模式；否则使用 Message 模式（当前行为）。

### Client 端流式接收

```javascript
// 新: 流式发送
const stream = node.sendTaskStream(url, text)
for await (const event of stream) {
  switch (event.kind) {
    case 'status-update':
      console.log(`[${event.status.state}] ${event.status.message?.parts?.[0]?.text || ''}`)
      break
    case 'artifact-update':
      console.log(`Artifact: ${event.artifact.name}`)
      for (const part of event.artifact.parts) {
        if (part.kind === 'text') console.log('  Text:', part.text)
        if (part.kind === 'file') console.log('  File:', part.file.name, part.file.mimeType)
        if (part.kind === 'data') console.log('  Data:', JSON.stringify(part.data))
      }
      break
  }
}

// 旧: 同步发送 — 依然有效
const result = await node.sendTask(url, text)
```

### MCP 工具扩展

| 工具 | 说明 |
|------|------|
| `send_task` | 不变，同步等待最终结果 |
| `send_task_stream` | 新增，返回流式进度事件 |
| `get_task_artifacts` | 新增，获取指定 task 的所有 artifact |

## 实现步骤

### Step 1: TaskMode Executor

升级 `MisakaAgentExecutor`，根据用户 executor 是否接受 eventBus 选择模式：

```
executor.length >= 2  → Task 模式 (创建 Task → status-update → artifact → completed)
executor.length < 2   → Message 模式 (当前行为，直接返回 Message)
```

**文件**: `packages/node/src/a2a/index.js`

### Step 2: EventBus Helper

创建用户友好的 eventBus wrapper：

```javascript
class MisakaEventBus {
  constructor(sdkEventBus, taskId, contextId) { ... }

  status(state, message)       // 发送 status-update
  artifact(name, parts)        // 发送 artifact-update
  progress(percent, message)   // status('working', `${percent}%: ${message}`)
  complete(message)            // status('completed', final: true) + finished()
  fail(error)                  // status('failed') + finished()
}
```

**文件**: `packages/node/src/a2a/event-bus.js` (新文件)

### Step 3: Client Streaming

在 `A2AClient` 中添加 `sendMessageStream()`：

```javascript
async *sendMessageStream(text, opts) {
  const client = await this._getClient()
  const stream = client.sendMessageStream(params)
  for await (const event of stream) {
    yield event
  }
}
```

在 `MisakaNode` 中暴露为 `sendTaskStream()`。

**文件**: `packages/node/src/a2a/index.js`, `packages/node/src/index.js`

### Step 4: Artifact 签名 (可选)

在 executor wrapper 中自动对每个 artifact 附加 DID:key 签名。

**文件**: `packages/node/src/a2a/index.js`

### Step 5: AgentCard 声明

更新 `createAgentCard()` 设置 `capabilities.streaming = true`。

**文件**: `packages/node/src/a2a/index.js`

### Step 6: 示例 + 测试

- `examples/streaming-agent.js` — 一个流式汇报进度的 Agent
- `examples/file-transfer.js` — 两个 Agent 之间传文件
- 更新 `two-nodes.js` 展示 streaming

### Step 7: MCP 工具

- `send_task_stream` — 流式发送
- `get_task_artifacts` — 查看 artifact

**文件**: `packages/mcp/bin/mcp-server.js`

## 验证标准

- [ ] 旧 executor (`() => string`) 依然正常工作
- [ ] 新 executor 能发送 status-update，client 能实时收到
- [ ] 新 executor 能发送 text/file/data artifact
- [ ] client.sendTaskStream() 返回 AsyncIterable 可迭代
- [ ] Artifact 附带 DID:key 签名，接收方可验证
- [ ] MCP send_task 依然同步工作
- [ ] Dashboard 能显示任务进度（远期）
