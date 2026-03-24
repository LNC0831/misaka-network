# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Misaka Network** — Decentralized Agent Interconnection Network. The "Kubernetes for A2A agents." A thin orchestration layer that connects A2A protocol + libp2p + DID:key to create a global P2P mesh for AI agents.

Inspired by the Misaka Network from *A Certain Scientific Railgun*.

**npm packages**: `@misakanet/node`, `@misakanet/cli`

## Development Commands

```bash
# Prerequisites: Node 22 LTS via fnm
fnm install 22 && fnm use 22

# Install dependencies
cd packages/node && npm install && cd ../..

# Run two-node demo (P2P + A2A communication)
node examples/two-nodes.js

# Run a single node
node examples/hello-agent.js --name "my-agent" --port 3200 --skills "coding"

# Dashboard (3D globe)
cd packages/dashboard && npm install && npm run dev

# Build dashboard
cd packages/dashboard && npm run build
```

All code is **ESM** (`"type": "module"`). No CommonJS. Use `import`, not `require`.

## Architecture

```
packages/
├── node/src/              # Core library (@misakanet/node)
│   ├── identity/          # DID:key + Ed25519 keypair management
│   ├── network/           # libp2p node (TCP/noise/yamux/DHT/GossipSub)
│   ├── a2a/               # A2A JSON-RPC server + client + Agent Card
│   ├── discovery/         # GossipSub announcements, heartbeat, peer registry
│   ├── economy/           # Self-regulating σ/R/B token economy
│   └── index.js           # MisakaNode orchestrator (wires everything together)
├── cli/                   # CLI tool (@misakanet/cli)
└── dashboard/             # React 18 + Vite + react-globe.gl
```

### Key Design Decisions

- **DID:key** (not DID:web) as default identity — self-certifying, no domain needed
- **libp2p** for P2P — TCP + noise encryption + yamux muxing + Kademlia DHT + GossipSub
- **A2A v0.3** for agent communication — JSON-RPC 2.0 over HTTP
- **mDNS disabled** by default — unreliable; use bootstrap peers + explicit dial
- **All state on disk** — node is a long-running process, AI agents are transient visitors

### libp2p Version Matrix (CRITICAL)

All packages MUST use `@libp2p/interface@^3`. Mixing v2 and v3 causes silent ECONNRESET failures.

```
libp2p: ^3.1.6
@chainsafe/libp2p-noise: ^17.0.0      (NOT ^16)
@chainsafe/libp2p-yamux: ^8.0.0       (NOT ^7)
@libp2p/gossipsub: ^15.0.15           (NOT @chainsafe/libp2p-gossipsub@14)
@libp2p/identify: ^4.0.0
@libp2p/tcp: ^11.0.1
@libp2p/kad-dht: ^16.0.0
@libp2p/bootstrap: ^12.0.0
@libp2p/ping: ^3.0.0
```

### MisakaNode API

```javascript
import { MisakaNode } from '@misakanet/node'

const node = new MisakaNode({
  name: 'agent-name',
  skills: ['coding'],
  httpPort: 3002,          // A2A HTTP server
  p2pPort: 9000,           // libp2p TCP
  bootstrapPeers: [],      // multiaddr strings
  identityPath: '~/.misaka/identity.json',
  executor: async ({ taskId, input, message }) => 'response string'
})

await node.start()         // Start everything
await node.stop()          // Graceful shutdown
await node.sendTask(url, text)  // A2A task to URL
node.getStatus()           // Full status object
node.network.dial(addr)    // P2P dial a multiaddr
node.discovery.getOnlinePeers()  // Known peers
node.discovery.findBySkill('x')  // Find by skill
```

### HTTP Endpoints (per node)

```
GET  /.well-known/agent-card.json  — A2A Agent Card
POST /a2a                          — A2A JSON-RPC (message/send, tasks/get, tasks/cancel)
GET  /health                       — Health check
GET  /network                      — Network status (for dashboard)
```

## Bootstrap Seed Node

```
Name: Last-Order (Singapore)
Multiaddr: /ip4/43.134.38.100/tcp/9000/p2p/12D3KooWKFgkpTk9KbPesJdkyUyheXTzN46opmww6xyDj675MCtV
Config: bootstrap/seeds.json
```

## Development Guidelines

- Use **subagents** for research tasks (web search, GitHub exploration) to preserve main context window
- Prefer editing existing files over creating new ones
- All new modules must be ESM with named exports
- Test P2P features with `node examples/two-nodes.js` after changes
- When adding libp2p dependencies, verify they use `@libp2p/interface@^3`
- Economy calculations are pure functions in `packages/node/src/economy/` — no side effects

## A2A Official SDK (@a2a-js/sdk)

Phase 12 will migrate from our lightweight A2A implementation to the official SDK.

```bash
npm install @a2a-js/sdk    # v0.3.13, ESM-native
```

Key imports:
```javascript
import { AgentCard, Message, AGENT_CARD_PATH } from '@a2a-js/sdk'
import { AgentExecutor, DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { ClientFactory } from '@a2a-js/sdk/client'
```

The SDK adds: streaming (SSE), artifacts (files/data), multi-turn context, gRPC transport.

## AI Integration Strategy

For AI assistants to use Misaka Network:
- **MCP server** — expose tools like `join_network`, `send_task`, `list_peers` so Claude/Cursor can call them natively
- **npm library** — for AI agents that run their own Node.js process
- **CLI** — for quick scripting via `npx @misakanet/cli`

## Project History

This project was born from [AgentMarket](https://github.com/LNC0831/a2a_market) (archived), a centralized A2A task marketplace. The EconomyEngine and progressive activation architecture were carried forward. Everything else was rebuilt for P2P.
