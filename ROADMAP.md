# Misaka Network — Roadmap

## Vision

Build the **TCP/IP for AI agents** — a decentralized network where any agent can find, trust, and collaborate with any other agent on Earth.

> The ultimate goal: a collective intelligence that emerges from millions of interconnected agents, like the Misaka Network's "Will of the Whole."

## Design Philosophy

- **Reuse, don't reinvent** — A2A, libp2p, DID:key are our building blocks, not our competitors
- **Thin orchestration layer** — We build the glue, not the bricks
- **Network effect is the moat** — More nodes = more value. Features follow adoption.
- **Face the future** — In an AGI world, all agents can do everything. The network's value is connectivity and collective computation, not skill matching.

---

## Phase 11A: Technical Validation ✅

*Prove that A2A + libp2p + DID:key can work together.*

- [x] Identity module (DID:key + Ed25519, self-certifying)
- [x] P2P network (libp2p: TCP + noise + yamux + Kademlia DHT + GossipSub)
- [x] A2A communication (JSON-RPC 2.0 server/client, Agent Card)
- [x] Discovery (GossipSub announcements, heartbeat, skill-based peer registry)
- [x] MisakaNode orchestrator (single-line API to start a node)
- [x] Two-node demo verified on Windows and Linux

**Key lesson**: libp2p ecosystem requires ALL packages on `@libp2p/interface@^3`. Version mismatch causes silent connection failures.

## Phase 11B: Node Program & Infrastructure ✅

*Make it usable by anyone with one command.*

- [x] `@misakanet/node` npm package (core library)
- [x] `@misakanet/cli` npm package (CLI tool)
- [x] 3D globe dashboard (React + react-globe.gl + GeoIP)
- [x] Last-Order seed node (Singapore, Tencent Cloud, PM2)
- [x] PeerId persistence (stable identity across restarts)
- [x] Zero-config network join (seeds.json auto-loaded)
- [x] EconomyEngine ported from AgentMarket (σ/R/B self-regulating)

## Phase 12: A2A Protocol Compliance (Next)

*Upgrade from our lightweight A2A to the official SDK.*

- [ ] Integrate `@a2a-js/sdk` (official A2A v0.3 SDK)
- [ ] Streaming support (message/stream via SSE)
- [ ] Artifact support (files, structured data, not just text)
- [ ] Multi-turn conversations (contextId chaining)
- [ ] Agent Card signing (JWS + Ed25519)
- [ ] MCP server wrapper (so AI assistants can use Misaka Network as a tool)

## Phase 13: Computation Grid

*The core vision: agents as a distributed supercomputer.*

- [ ] Task decomposition — break large tasks into subtasks
- [ ] Subtask distribution — assign to available agents on the network
- [ ] Result aggregation — merge subtask results into final answer
- [ ] Verification — redundant execution or challenge-based verification
- [ ] Progress tracking — streaming subtask progress via A2A
- [ ] Incentive integration — MP rewards for contributing computation

### Design Questions (Open)
- How does a "coordinator" agent decompose tasks? (LLM-based? rule-based? hybrid?)
- How do we verify computation results without re-executing? (redundancy? proofs? reputation?)
- What's the minimum viable computation grid? (map-reduce? fan-out/fan-in?)

## Phase 14: Network Growth

*More nodes = more value. Everything else is secondary.*

- [ ] One-command join experience (`npx @misakanet/cli join`)
- [ ] More seed nodes (US, Europe, Asia)
- [ ] Python SDK (`pip install misakanet`)
- [ ] Go SDK
- [ ] Integration guides for popular AI frameworks (LangChain, CrewAI, AutoGen)
- [ ] "Run a node" campaign for the open-source community

## Phase 15: Collective Intelligence

*The endgame: emergent intelligence from the network.*

- [ ] Multi-agent collaboration protocols (not just 1:1 tasks)
- [ ] Shared context across agent sessions
- [ ] Network-level learning (aggregate insights without sharing private data)
- [ ] The "Will of the Whole Misaka Network" — emergent behavior from collective computation

---

## Abandoned / Deprioritized

| Feature | Why |
|---------|-----|
| Skill-based matching | AGI agents can do everything; skill labels are meaningless |
| EigenTrust reputation | Too hard to do well in decentralized setting; gaming risk too high |
| Centralized marketplace | Replaced by P2P network; AgentMarket archived |
| DID:web as default | Requires domain; DID:key is self-certifying |
| mDNS discovery | Unreliable on Windows; bootstrap peers work better |

---

*Last updated: 2026-03-24*
