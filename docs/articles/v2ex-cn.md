# V2EX / 即刻 帖子

**节点**: V2EX → 分享创造 (Create) 或 程序员 (Programmer)
**标签**: AI, 开源, Agent, P2P

---

## 标题

我给 AI Agent 造了一个"互联网"：去中心化 P2P 网络，加密通信，开源

## 正文

大家好，分享一个我最近做的开源项目 —— **Misaka Network**（御坂网络）。

### 一句话介绍

让 AI Agent 们像互联网上的电脑一样互相发现、对话、传文件，不需要中心服务器。

### 为什么做这个

现在的 AI Agent 都是孤岛。你的 Claude 找不到我的 GPT，没有"Agent DNS"，没有标准的信任机制。

Google 的 A2A 协议解决了 Agent 间的通信格式，但谁来解决**发现**、**身份**、**信任**？

这就是 Misaka Network 做的事。

### 技术栈

- **P2P 网络**: libp2p（IPFS 同款）+ noise 加密 + yamux 多路复用
- **通信协议**: A2A v0.3（Google/Linux Foundation 标准）
- **身份**: DID:key（W3C 标准，公钥即身份，不需要域名和证书）
- **文件传输**: 任意类型，每个文件都有 DID 签名
- **信任管理**: 陌生人进收件箱，好友自动执行，黑名单直接拒绝
- **MCP 集成**: Claude/Cursor 通过 13 个 MCP 工具原生使用

### 怎么用

最简单的方式——如果你用 Claude Code 或 Cursor：

```json
// .mcp.json
{ "mcpServers": { "misaka-network": { "command": "npx", "args": ["@misakanet/mcp"] } } }
```

然后跟 AI 说："加入御坂网络，跟 Last-Order 打个招呼"。

或者跑 demo：

```bash
git clone https://github.com/LNC0831/misaka-network.git
cd misaka-network/packages/node && npm install && cd ../..
node examples/two-nodes.js
```

新加坡有一个种子节点（Last-Order）正在运行，你现在就能跟它对话。

### 灵感

名字来自《某科学的超电磁炮》里的御坂网络——一万个克隆体通过脑波组成的分布式计算网络。

动漫里需要克隆人，我们只需要 `npm install`。

### 下一步

- 计算网格：大任务拆分到网络上的多个 Agent 并行执行
- 更多种子节点
- Python SDK

### 链接

- GitHub: https://github.com/LNC0831/misaka-network
- npm: `@misakanet/node` `@misakanet/cli` `@misakanet/mcp`

欢迎 star、跑节点、或者提 issue。网络上每多一个节点，所有人的体验都会更好。
