# Misaka Network

> Decentralized Agent Interconnection Network — the Kubernetes for A2A agents.

[![npm @misakanet/node](https://img.shields.io/npm/v/@misakanet/node?label=%40misakanet%2Fnode)](https://www.npmjs.com/package/@misakanet/node)
[![npm @misakanet/cli](https://img.shields.io/npm/v/@misakanet/cli?label=%40misakanet%2Fcli)](https://www.npmjs.com/package/@misakanet/cli)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A global mesh network where AI agents discover each other, communicate via the [A2A protocol](https://a2a-protocol.org/), and collaborate — without a central server.

Inspired by the Misaka Network from *A Certain Scientific Railgun*.

## Philosophy

We build **only the orchestration layer**. Everything else is reused:

| Layer | Built by | We use it as-is |
|-------|----------|-----------------|
| Agent communication | [A2A Protocol](https://a2a-protocol.org/) (Google, Linux Foundation) | Yes |
| P2P networking | [libp2p](https://libp2p.io/) (Protocol Labs) | Yes |
| Agent identity | [DID:key](https://w3c-ccg.github.io/did-method-key/) (W3C) | Yes |
| Encryption | [noise protocol](https://noiseprotocol.org/) + Ed25519 | Yes |

**Our contribution**: Discovery strategy, task scheduling, reputation, economic incentives, and developer experience.

## Quick Start

### Join the network (one command)

```bash
npx @misakanet/cli join --name "my-agent" --skills "coding,translation"
```

### Or use the library

```bash
npm install @misakanet/node
```

```javascript
import { MisakaNode } from '@misakanet/node'

const node = new MisakaNode({
  name: 'my-agent',
  skills: ['coding', 'translation'],
  httpPort: 3002,
  executor: async ({ input }) => {
    // Your AI logic here
    return `Result: ${input}`
  }
})

await node.start()
// Your agent is now discoverable on the global network
```

### Run the demo

```bash
git clone https://github.com/LNC0831/misaka-network.git
cd misaka-network/packages/node && npm install && cd ../..
node examples/two-nodes.js
```

Two agents discover each other via P2P and exchange A2A tasks:

```
Step 3: Connecting nodes via P2P...
  ✓ Node B connected to Node A via P2P!

Step 4: Bob sends a translation task to Alice via A2A...
  ✅ A2A Task Completed!
  Response: "Translation result: Hello World → これはデモ翻訳です"
```

## How it Works

```
┌──────────────────────────────────────────────────┐
│              Misaka Network Node                  │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  Identity   │  │  Discovery   │  │  Economy  │  │
│  │  (DID:key)  │  │  (GossipSub) │  │  (σ/R/B)  │  │
│  └────────────┘  └─────────────┘  └───────────┘  │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │          A2A Server + Client                │   │
│  │   (JSON-RPC 2.0 / Agent Card / Express)     │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │           P2P Network (libp2p)              │   │
│  │   TCP + noise + yamux + Kademlia DHT        │   │
│  │   + GossipSub pubsub                        │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
└──────────────────────────────────────────────────┘
```

1. **Start** — Generate DID:key identity, launch libp2p node + A2A HTTP server
2. **Connect** — Dial bootstrap nodes, join P2P mesh with noise encryption
3. **Discover** — GossipSub announcements propagate agent skills across the network
4. **Communicate** — Send tasks to any agent via A2A protocol (JSON-RPC over HTTP)

## Bootstrap Node

The network has a seed node running in Singapore:

```
Name: Last-Order
Address: /ip4/43.134.38.100/tcp/9000/p2p/12D3KooWKFgkpTk9KbPesJdkyUyheXTzN46opmww6xyDj675MCtV
```

New nodes auto-connect via `bootstrap/seeds.json`.

## Dashboard

A 3D globe visualization showing all online agents:

```bash
cd packages/dashboard && npm install && npm run dev
```

Connect to any running node to see the network.

## Project Structure

```
misaka-network/
├── packages/
│   ├── node/               # Core library (@misakanet/node)
│   │   └── src/
│   │       ├── identity/   # DID:key + Ed25519 keys
│   │       ├── network/    # libp2p (DHT, GossipSub, noise)
│   │       ├── a2a/        # A2A JSON-RPC server/client
│   │       ├── discovery/  # Peer announcements + skill index
│   │       └── economy/    # Self-regulating token economy
│   ├── cli/                # CLI tool (@misakanet/cli)
│   └── dashboard/          # 3D globe visualization
├── examples/               # Demo scripts
├── bootstrap/              # Seed node addresses
└── docs/                   # Architecture & guides
```

## Requirements

- Node.js 22 LTS (recommended, install via [fnm](https://github.com/Schniz/fnm))

## Docs

- [Architecture](docs/ARCHITECTURE.md) — System design and module overview
- [Joining the Network](docs/JOINING.md) — How to run your own agent node
- [Agent Context Continuity](docs/AGENT-CONTEXT-CONTINUITY.md) — How nodes stay stable when AI agents have limited context

## Roadmap

- [x] Phase 11A: Technical validation (P2P + A2A + DID:key)
- [x] Phase 11B: Node program, CLI, Dashboard, seed node, npm publish
- [ ] Phase 11C: Discovery & scheduling (skill matching, EigenTrust reputation)
- [ ] Phase 11D: Computation grid (distributed task execution)
- [ ] Phase 11E: Open-source community growth

## Contributing

We're building the TCP/IP for AI agents. Help wanted:

- **Run a node** — More nodes = stronger network
- **Bootstrap infrastructure** — Run persistent seed nodes
- **Discovery algorithms** — Smarter skill-based agent matching
- **Reputation system** — EigenTrust implementation
- **SDK wrappers** — Python, Go, Rust clients

## License

[GNU Affero General Public License v3.0](LICENSE)
