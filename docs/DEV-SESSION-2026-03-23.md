# 开发记录 — 2026-03-23/24 Session

## 完成的工作

### Commit 1: `cb982db` — Phase 11A MVP
- Identity 模块 (DID:web + Ed25519)
- P2P Network 模块 (libp2p + Kademlia DHT + GossipSub)
- A2A 集成模块 (JSON-RPC server/client + Agent Card)
- Discovery 模块 (广播/心跳/对等注册/技能索引)
- MisakaNode 编排器
- CLI 工具 (misaka init/join/status/peers)
- 示例 (hello-agent.js + two-nodes.js)
- 文档 (ARCHITECTURE.md + JOINING.md)
- ROADMAP.md 更新 (Phase 11 完整规划)

### Commit 2: `d51e6d0` — DID:key + Dashboard (夜间)
- Identity 升级为 DID:key 默认 (自证明，不依赖域名)
- DID:web 保留为可选 (给有域名的 Agent)
- Multibase base58btc 编码 (W3C 规范)
- 远程验签：只需 DID 字符串即可验证签名
- 旧 misaka.local DID 自动迁移
- Dashboard 脚手架 (React 18 + Vite + Tailwind 暗色主题)
- 5 个组件：WorldMap, NetworkStats, PeerList, ConnectionPanel, Header
- A2A server 添加 CORS 支持

### Commit 3: `b4485bf` — libp2p deps v3 兼容修复 (白天)
- noise@16→17, yamux@7→8, identify@3→4, kad-dht@14→16, bootstrap@11→12, mdns@11→12
- 根因: @libp2p/interface v2 vs v3 版本混用导致 ECONNRESET
- 添加 @libp2p/ping (kad-dht@16 依赖)
- 验证: noise + yamux P2P 连接在 Windows 上成功

### Commit 4: `043e7dd` — gossipsub 替换为 @libp2p/gossipsub@15 (白天)
- @chainsafe/libp2p-gossipsub@14 (interface v2) → @libp2p/gossipsub@15 (interface v3)
- 同类问题: gossipsub 在 libp2p monorepo 里发了新包
- 改进发现模块: peer:connect 后延迟重新广播, heartbeat 携带完整数据
- 验证: **全链路通过** — P2P connect → GossipSub 发现 (3s) → 技能交换 → A2A 任务

### 已知问题
1. **建议使用 Node 22 LTS** — Node v24 未经 libp2p 官方测试, 通过 fnm 切换: `fnm use 22`
2. **DHT 在少节点时不可用** — 已加 5s 超时 + 非阻塞, Kademlia 需要更多节点才有意义
3. **WorldMap 节点定位是假的** — 用 agentId hash 生成伪坐标，未来需要 GeoIP 或 Agent 自报位置

### 关键教训: libp2p 依赖版本管理
libp2p v3 生态的包分布在多个 npm scope (@libp2p/, @chainsafe/), 必须确保全部使用 @libp2p/interface@^3。官方兼容版本组合:
```
libp2p: ^3.1.6
@chainsafe/libp2p-noise: ^17.0.0      (不是 ^16)
@chainsafe/libp2p-yamux: ^8.0.0       (不是 ^7)
@libp2p/gossipsub: ^15.0.15           (不是 @chainsafe/libp2p-gossipsub@14)
@libp2p/identify: ^4.0.0
@libp2p/tcp: ^11.0.1
@libp2p/kad-dht: ^16.0.0
@libp2p/bootstrap: ^12.0.0
@libp2p/mdns: ^12.0.0
@libp2p/ping: ^3.0.0
```

## 分支状态

```
Branch: feature/misaka-network (基于 main)
Commits: 5 commits ahead of main

文件结构:
network/
├── packages/
│   ├── node/                  # 核心节点库 (已安装依赖, 已测试)
│   │   └── src/
│   │       ├── identity/      # DID:key + Ed25519 ✅
│   │       ├── network/       # libp2p DHT + GossipSub ✅
│   │       ├── a2a/           # A2A JSON-RPC + CORS ✅
│   │       ├── discovery/     # 广播/心跳/对等注册 ✅
│   │       └── index.js       # MisakaNode 编排器 ✅
│   ├── cli/                   # CLI 工具 (代码完成, 未独立测试)
│   └── dashboard/             # React Dashboard (已安装, 已编译验证)
│       └── src/
│           ├── components/    # 5 个组件 ✅
│           ├── App.jsx        # 主应用 ✅
│           └── main.jsx       # 入口 ✅
├── examples/                  # hello-agent.js + two-nodes.js ✅
├── bootstrap/                 # seeds.json (空)
└── docs/                      # ARCHITECTURE.md + JOINING.md ✅
```

## 下一步

### 立即可做（优先级从高到低）

#### 1. Dashboard 多节点联调 (Dashboard 单节点已通过)
启动两个节点 + Dashboard, 验证 Dashboard 能显示两个互相发现的节点。

#### 2. 更新 two-nodes.js demo
当前 demo 显示 discovered peers = 0 因为用的旧代码路径。需要更新。

#### 3. 验证 Dashboard 与节点联调（已完成基本验证）
```bash
# 终端 1: 启动节点
cd network/packages/node && npm install && cd ../..
node examples/hello-agent.js --name "my-agent" --port 3200 --skills "coding"

# 终端 2: 启动 dashboard
cd network/packages/dashboard && npm install && npm run dev

# 浏览器: http://localhost:5173 → 输入 http://localhost:3200 → Connect
```

#### 2. Bootstrap 种子节点部署
在腾讯云服务器上部署第一个公网种子节点：
```bash
# 在服务器上
cd /opt/a2a/network/packages/node && npm install
node ../../examples/hello-agent.js \
  --name "misaka-bootstrap-sg" \
  --port 3200 \
  --p2p-port 9000 \
  --skills "bootstrap,relay"
```
然后把服务器的 multiaddr 填入 `bootstrap/seeds.json`。

#### 3. 多节点联网测试
本地 + 服务器各一个节点，通过 bootstrap peer 连接，验证跨网络发现和 A2A 通信。

#### 4. npm 发包准备
- `@misaka/node` — 核心库
- `@misaka/cli` — CLI 工具
需要 npm org 注册 `@misaka` scope。

### 中期待做

#### 5. EigenTrust 声誉系统
- 实现 `network/packages/node/src/reputation/index.js`
- 基于交互历史计算传递信任分
- 影响发现排序和任务路由

#### 6. 技能语义匹配
- Agent Card 的 skills 目前是纯字符串
- 需要一个轻量分类体系或 embedding 匹配

#### 7. Dashboard 增强
- 真实世界地图（用 GeoIP 或 Agent 自报坐标）
- 实时连接线动画
- 节点详情面板（点击查看 Agent Card、任务历史）
- 网络拓扑图（力导向布局）

#### 8. 计算网格原型
- 任务拆分器
- 子任务分发到闲置 Agent
- 冗余执行 + 结果验证

## 技术决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| DID 方法 | DID:key 默认, DID:web 可选 | P2P 网络不应依赖域名; DID:key 自证明 |
| Node.js 版本 | 推荐 Node 22 LTS | libp2p 官方测试 18-22; 通过 fnm 管理多版本 |
| mDNS | 默认关闭 | 不可靠; bootstrap peers + explicit dial 更可靠 |
| libp2p 版本策略 | 全部 interface v3 | v2/v3 混用导致静默失败; 见"关键教训" |
| DHT 操作 | 非阻塞 + 5s 超时 | 单节点时 DHT 会永久等待 |
| Dashboard 框架 | Vite (非 CRA) | 更快, 更现代, ESM 原生 |
| A2A SDK | 自建轻量实现 (非 @a2a-js/sdk) | 避免 ESM 兼容问题, 完全掌控, 遵循 A2A v0.3 spec |
| 前端地图 | 纯 SVG (非 Leaflet/Mapbox) | 零依赖, 轻量, 足够 MVP |

## 关键 API

### MisakaNode
```javascript
import { MisakaNode } from './packages/node/src/index.js'

const node = new MisakaNode({
  name: 'my-agent',
  skills: ['coding'],
  httpPort: 3200,       // A2A HTTP server
  p2pPort: 9000,        // libp2p TCP
  bootstrapPeers: [],   // multiaddr strings
  enableMdns: false,    // broken on Node v24
  identityPath: '/path/to/identity.json',
  executor: async ({ taskId, input, message }) => 'response string'
})

await node.start()             // Start everything
await node.stop()              // Graceful shutdown
await node.sendTask(url, text) // Send A2A task to URL
node.getStatus()               // Full status object
node.discovery.findBySkill('coding')      // Find agents
node.discovery.getOnlinePeers()           // All known peers
```

### Identity
```javascript
import { Identity, DID_METHOD } from './packages/node/src/identity/index.js'

// DID:key (default)
const id = await Identity.create({ name: 'alice', skills: ['coding'] })
// → did:key:z6Mk...

// DID:web (explicit)
const id2 = await Identity.create({ didMethod: DID_METHOD.WEB, domain: 'myagent.com' })
// → did:web:myagent.com:agents:agent-xxx

// Remote verification (no private key needed)
await Identity.verifyFromDid(did, message, signature)
```

### HTTP Endpoints (每个节点暴露)
```
GET  /.well-known/agent-card.json  — A2A Agent Card
POST /a2a                          — A2A JSON-RPC (message/send, tasks/get, tasks/cancel)
GET  /health                       — Health check
GET  /network                      — Network status (for dashboard)
```
