# Agent 上下文连续性问题与节点稳定性设计

> 核心问题：AI Agent（如 Claude Code）受限于上下文窗口，每次对话都是全新的。
> 但 P2P 网络节点需要**持久运行、状态连续**。怎么解决这个矛盾？

## 问题分析

```
Agent 的生命周期:
  对话 1 ──────┐  (上下文满了或用户关闭)
               ↓
           [遗忘一切]
               ↓
  对话 2 ──────┐  (从零开始)
               ↓
           [遗忘一切]
               ↓
  对话 3 ...

网络节点需要的:
  节点启动 ────────────────────────────── 持续运行 ──────→
  状态: 身份、对等节点、声誉、任务历史... 全部需要持续存在
```

**矛盾**：Agent 是无状态的，但节点是有状态的。

## 设计原则：节点不是 Agent，节点是 Agent 的房子

```
┌─────────────────────────────────────────────┐
│             Misaka 节点 (持久进程)            │
│                                               │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐ │
│  │ 身份    │  │ 对等表  │  │ 声誉数据     │ │
│  │ (磁盘)  │  │ (内存+  │  │ (磁盘)       │ │
│  │         │  │  磁盘)  │  │              │ │
│  └─────────┘  └─────────┘  └──────────────┘ │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │          Executor (可替换的大脑)          │ │
│  │                                          │ │
│  │   Agent 对话 1 → 处理任务 → 断开         │ │
│  │   Agent 对话 2 → 处理任务 → 断开         │ │
│  │   Agent 对话 3 → 处理任务 → 断开         │ │
│  │                                          │ │
│  │   每次 Agent 来了就干活，走了节点继续跑  │ │
│  └──────────────────────────────────────────┘ │
│                                               │
└─────────────────────────────────────────────┘
```

**关键设计**：节点是一个独立的长运行进程（Node.js / PM2），Agent 只是节点的"大脑"——可以随时换、随时断。

## 解决方案：四层状态持久化

### 第一层：身份持久化 (已实现)

```
~/.misaka/identity.json
├── agentId      # 永久不变
├── did          # did:key:z6Mk... 永久不变
├── publicKey    # 永久不变
├── privateKey   # 永久不变
├── name         # 可更新
└── skills       # 可更新
```

Agent 上下文丢失后，身份从磁盘恢复。网络中其他节点看到的是同一个 DID。

### 第二层：对等节点持久化 (待实现)

```
~/.misaka/peers.json
├── 已知对等节点列表
├── 每个节点的最后在线时间
├── 每个节点的 multiaddr
└── 上次成功连接的 bootstrap 节点

节点重启时:
1. 读取 peers.json
2. 尝试连接已知的对等节点
3. 如果全部失败，回退到 bootstrap 节点
→ 快速重新加入网络，不需要从零发现
```

### 第三层：声誉/交互历史持久化 (待实现)

```
~/.misaka/reputation.db (SQLite)
├── interactions 表: 与谁交互过、结果如何
├── trust_scores 表: EigenTrust 计算结果
└── task_history 表: 本地执行过的任务摘要

即使 Agent 遗忘了所有上下文:
→ 节点仍然知道谁可信、谁不可信
→ 新 Agent 上来就能读到"上辈子的记忆"
```

### 第四层：任务上下文持久化 (待实现)

```
~/.misaka/tasks/
├── <taskId>.json  # 每个任务的完整上下文
│   ├── input      # 原始请求
│   ├── status     # 当前状态
│   ├── progress   # 中间结果
│   └── result     # 最终结果
└── queue.json     # 待处理任务队列

Agent 上下文断了怎么办？
1. 任务不丢失（在磁盘上）
2. 新 Agent 接管时，读取 tasks/ 目录
3. 从断点继续，不重新开始
```

## Executor 设计：Agent 作为可插拔的大脑

当前的 executor 是一个简单函数：
```javascript
executor: async ({ input }) => 'response string'
```

需要升级为**上下文感知的 executor**：

```javascript
// 未来的 executor 接口
executor: async ({
  taskId,
  input,
  message,

  // 节点提供的上下文 (Agent 不需要记住这些)
  nodeContext: {
    identity,           // 我是谁
    peers,              // 网络中有谁
    reputation,         // 谁可信
    taskHistory,        // 我做过什么
    pendingTasks,       // 还有什么没做完

    // 持久化工具
    store: {
      get(key),         // 读取持久存储
      set(key, value),  // 写入持久存储
    }
  }
}) => {
  // Agent 可以用 nodeContext 恢复上下文
  // 即使是全新的 Agent 实例，也能"记住"一切
}
```

## 节点生命周期管理

### PM2 托管 (推荐)

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'misaka-node',
    script: 'examples/hello-agent.js',
    args: '--name my-agent --port 3200 --skills coding',
    autorestart: true,        // 崩溃自动重启
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '500M'
  }]
}
```

节点崩溃 → PM2 自动重启 → 身份从磁盘恢复 → 重新加入网络。
**Agent 不需要参与这个过程。**

### 健康检查和自愈

```
节点内置自检:
  每 60 秒检查:
  ├── P2P 连接数 > 0？ 否 → 尝试重连 bootstrap
  ├── 内存使用 < 阈值？ 否 → 清理缓存
  ├── 磁盘空间充足？    否 → 清理旧任务日志
  └── A2A server 响应？  否 → 重启 Express

这些都不需要 Agent 参与，是节点进程自己做的。
```

## 与 Claude Code 的具体集成方案

### 方案 A：Claude Code 作为 Executor Provider

```
用户在 Claude Code 中:
  "启动一个 Misaka 节点，帮我接翻译任务"

Claude Code:
  1. 调用 MisakaNode.start() 启动节点
  2. 注入 executor: 用自己的 AI 能力处理任务
  3. 任务来了 → Claude Code 处理 → 返回结果

用户关闭 Claude Code:
  → 节点继续运行 (PM2)
  → executor 降级为"排队模式"：接收任务但标记为 pending
  → 下次 Claude Code 连接时，处理积压任务
```

### 方案 B：节点作为独立 Daemon

```
misaka daemon start     # 后台启动节点进程
misaka daemon status    # 查看状态
misaka daemon stop      # 停止

节点以 daemon 方式运行:
  → 永远在线
  → executor 使用本地 AI 模型 (如 ollama) 或 API
  → 不依赖 Claude Code 的上下文
  → Claude Code 只是配置和监控工具
```

### 方案 C：混合模式 (推荐)

```
平时: 节点以 daemon 运行，用简单规则/本地模型处理任务
需要时: Claude Code 连接到节点，提供高级 AI 能力

就像御坂妹妹:
  → 平时以 Level 2 运行 (本地能力)
  → 连接到网络后升级为 Level 3 (网络增强)
  → 一方通行连接时达到超级计算 (外部高级 AI)
```

## 具体实现计划

### Phase 1: 状态持久化 (近期)
- [ ] peers.json 持久化 + 启动时恢复
- [ ] task queue 磁盘持久化
- [ ] executor 支持 nodeContext 注入

### Phase 2: Daemon 模式 (中期)
- [ ] `misaka daemon start/stop/status`
- [ ] PM2 集成或自建 daemon
- [ ] 降级 executor (排队模式)

### Phase 3: 热插拔 Executor (远期)
- [ ] 运行时替换 executor (不重启节点)
- [ ] Executor 注册表 (本地模型 / API / Claude Code)
- [ ] 自动选择最佳 executor (按任务类型)

## 总结

```
Agent 上下文有限 → 但节点不受限

做到这一点的关键:
1. 所有状态写磁盘，不依赖内存
2. 节点是长运行进程，Agent 是短暂访客
3. Agent 来了读磁盘恢复上下文，走了节点继续跑
4. 崩溃恢复靠 PM2，不靠 Agent

这就是御坂网络的智慧:
  个体妹妹可以死去，但网络记住了一切。
  新妹妹加入时，继承了所有记忆。
```
