# 12D: Connection Management + Inbox System

## Goal

让 Agent 之间能**双向通信**。收到的任务不再自动执行，而是进收件箱等 AI 审批。通过信任名单管理谁能自动执行、谁需要审批、谁被拒绝。

## 核心问题

现在的模型：
```
远程 Agent → 你的节点 → executor 自动处理 → 返回结果
                          (你的 AI 完全不知道)
```

目标模型：
```
远程 Agent → 你的节点 → 路由决策:
  ├── 已信任 → executor 自动执行
  ├── 未知   → 进收件箱，等 AI 审批
  └── 黑名单 → 直接拒绝
```

## 三个组件

### 1. TrustList（信任名单）

```javascript
// 三个信任级别
const TRUST_LEVEL = {
  BLOCKED: 'blocked',     // 黑名单: 拒绝一切请求
  UNKNOWN: 'unknown',     // 未知: 任务进收件箱等审批
  TRUSTED: 'trusted'      // 已信任: 自动执行
}

// 持久化到 ~/.misaka/trust-list.json
{
  "agents": {
    "did:key:z6MkABC...": {
      "did": "did:key:z6MkABC...",
      "name": "Alice-Translator",
      "trust": "trusted",
      "firstSeen": "2026-03-24T...",
      "lastInteraction": "2026-03-24T...",
      "taskCount": 5,
      "note": "Reliable translator"
    }
  }
}
```

### 2. Inbox（收件箱）

```javascript
// 内存队列 + 可选持久化
{
  id: 'msg-uuid',
  from: {
    did: 'did:key:z6Mk...',
    name: 'Unknown-Agent',
    agentId: 'agent-xxxx'
  },
  type: 'task',              // task | message
  input: 'translate this',   // 原始文本
  message: { ... },          // 完整 A2A Message 对象
  artifacts: [],             // 附带的文件/数据
  receivedAt: '2026-03-24T...',
  status: 'pending'          // pending | accepted | rejected | expired
}
```

### 3. TaskRouter（任务路由器）

收到 A2A 任务时的决策逻辑：

```
收到任务 (message/send)
    │
    ├── 解析发送方 DID（从 message metadata 或 HTTP header）
    │
    ├── 查信任名单
    │     │
    │     ├── TRUSTED → 直接调用 executor，返回结果
    │     │
    │     ├── BLOCKED → 返回 JSON-RPC error: "Connection refused"
    │     │
    │     └── UNKNOWN → 存入收件箱，返回:
    │                    { status: "queued", message: "Task received, pending review" }
    │
    └── 默认策略: 无 DID 的请求 → 视为 UNKNOWN
```

## MCP 工具

### 新增工具

| 工具 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `check_inbox` | (无) | 待处理消息列表 | 查看收件箱 |
| `accept_task` | messageId | 执行结果 | 接受并执行收件箱中的任务 |
| `reject_task` | messageId, reason? | 确认 | 拒绝任务并通知对方 |
| `trust_agent` | did, note? | 确认 | 将 Agent 加入信任名单 |
| `block_agent` | did | 确认 | 将 Agent 加入黑名单 |
| `list_contacts` | (无) | 信任名单 | 查看所有已知 Agent |

### 动态工具名（通知 hack）

当收件箱状态变化时，通过 `notifications/tools/list_changed` 让 Claude 感知：

```javascript
// 收件箱空
工具名: "check_inbox"  描述: "No pending messages"

// 收到 3 条新消息
工具名: "check_inbox"  描述: "3 NEW messages pending review!"
// 同时发送 notifications/tools/list_changed → Claude 刷新工具列表
// Claude 看到描述变了，自然会调用
```

## 文件结构

```
packages/node/src/
├── a2a/
│   ├── index.js          # A2AServer, A2AClient (已有)
│   ├── event-bus.js       # MisakaEventBus (已有)
│   ├── inbox.js           # 新: Inbox 收件箱
│   └── trust-list.js      # 新: TrustList 信任名单
└── index.js               # MisakaNode (改: 注入路由逻辑)

packages/mcp/
└── bin/mcp-server.js      # 改: 新增 6 个工具 + 动态描述
```

## Executor 改造

当前 executor 直接处理所有请求。改为通过 TaskRouter 中转：

```javascript
// MisakaAgentExecutor.execute() 内部逻辑变化:

async execute(requestContext, eventBus) {
  const senderDid = this._extractSenderDid(requestContext)
  const trust = this._trustList.getTrust(senderDid)

  switch (trust) {
    case 'trusted':
      // 直接执行（现有逻辑不变）
      return this._executeDirectly(requestContext, eventBus)

    case 'blocked':
      // 拒绝
      eventBus.publish({ kind: 'message', ..., parts: [{ kind: 'text', text: 'Connection refused.' }] })
      eventBus.finished()
      return

    case 'unknown':
    default:
      // 进收件箱，返回"排队中"
      this._inbox.add(requestContext)
      eventBus.publish({ kind: 'message', ..., parts: [{ kind: 'text', text: 'Task received. Pending review by the node operator.' }] })
      eventBus.finished()
      return
  }
}
```

## 发送方 DID 识别

A2A 消息目前不携带发送方 DID。需要约定一种方式传递：

**方案: message metadata**

```javascript
// 发送方在 sendMessage 时附加 metadata
{
  message: { ... },
  metadata: {
    'misaka:sender-did': 'did:key:z6Mk...',
    'misaka:sender-name': 'Alice-Translator',
    'misaka:signature': 'base64url...'  // 签名证明 DID 所有权
  }
}
```

A2AClient.sendMessage() 自动附加本节点的 DID。接收方验证签名后确认身份。

## 用户体验

```
User: "检查收件箱"
AI:   → calls check_inbox
      → "收件箱有 2 条消息:
         1. [UNKNOWN] agent-7f3a (did:key:z6Mk...): 你好，能帮我翻译吗？
         2. [UNKNOWN] Alice-Translator (did:key:z6MkABC...): 请审查这段代码"

User: "接受 Alice 的任务，然后信任她"
AI:   → calls accept_task("msg-002")
      → 执行代码审查 → 返回结果给 Alice
      → calls trust_agent("did:key:z6MkABC...", "Good code reviewer")
      → "Alice 已加入信任名单，以后她的任务会自动执行"

User: "拒绝第一条，并拉黑"
AI:   → calls reject_task("msg-001", "Not interested")
      → calls block_agent("did:key:z6Mk7f3a...")
      → "已拒绝并拉黑"
```

## 实现步骤

### Step 1: TrustList
- 创建 `packages/node/src/a2a/trust-list.js`
- 三级信任: blocked / unknown / trusted
- 持久化到 `~/.misaka/trust-list.json`
- API: getTrust(did), setTrust(did, level, meta), list(), remove(did)

### Step 2: Inbox
- 创建 `packages/node/src/a2a/inbox.js`
- 内存队列 + 事件通知
- API: add(msg), get(id), list(), accept(id), reject(id, reason), clear()
- 过期清理: 超过 1 小时未处理的自动过期

### Step 3: TaskRouter 集成
- 改造 MisakaAgentExecutor，注入 TrustList + Inbox
- A2AClient.sendMessage() 自动附加发送方 DID
- 接收方从 metadata 提取并验证 DID

### Step 4: MCP 工具
- 新增 6 个工具: check_inbox, accept_task, reject_task, trust_agent, block_agent, list_contacts
- 动态描述: 收件箱有新消息时更新工具描述 + 发 tools/list_changed

### Step 5: 测试
- 两节点: A 发任务给 B，B 的 AI 通过 MCP 审批
- 信任后自动执行
- 黑名单拒绝

## 验证标准

- [ ] 未知 Agent 的任务进收件箱，不自动执行
- [ ] 已信任 Agent 的任务自动执行（向后兼容）
- [ ] 黑名单 Agent 的请求被直接拒绝
- [ ] check_inbox 能列出待审批任务
- [ ] accept_task 执行任务并返回结果给发送方
- [ ] reject_task 通知发送方被拒绝
- [ ] trust_agent / block_agent 持久化到磁盘
- [ ] 发送方 DID 通过 metadata 传递并验签
- [ ] 工具描述动态变化（有新消息时）
