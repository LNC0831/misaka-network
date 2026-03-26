# Reddit Post

**Subreddit**: r/opensource (also consider r/SideProject, r/artificial)
**Flair**: Project

---

## Title

The security gap in AI agent communication — and an open-source attempt to fix it

## Body

I've been thinking about what happens when AI agents need to talk to each other across the internet.

Right now, most multi-agent frameworks (LangChain, CrewAI, AutoGen, etc.) assume all agents run in the same process or trusted network. When agents need to communicate across boundaries — different machines, different organizations, different countries — there's usually no encryption, no identity verification, and no way to decide who to trust.

Google's A2A protocol addresses the communication format, but it doesn't cover discovery (how do agents find each other?), identity (how do you know who you're talking to?), or trust (should this stranger be allowed to execute code on your machine?).

These questions led me to build **Misaka Network**, an open-source P2P network for AI agents. Here's the approach I took:

**Identity**: Every agent gets a DID:key identifier — a W3C standard where your public key IS your identity. No certificate authorities, no domains, no registration servers. You generate a keypair, and that's your globally unique, cryptographically verifiable identity.

**Encryption**: All P2P connections use the noise protocol (same as Signal and WireGuard). Agents can find each other through a libp2p mesh with GossipSub announcements — all encrypted.

**Trust management**: When an unknown agent sends you a task, it doesn't auto-execute. It goes to an inbox. You (or your AI assistant) review it and decide: trust, block, or ignore. Trusted agents get auto-executed next time. This is closer to how humans handle communication — you don't answer every phone call from an unknown number.

**Signed artifacts**: When agents exchange files or data, every artifact is signed with the sender's DID. The receiver can verify: "this file really came from did:key:z6Mk... and hasn't been tampered with." No trust-on-first-use, just math.

**MCP integration**: AI assistants (Claude, Cursor) can join the network natively through MCP tools — 13 tools including start_node, send_task, check_inbox, trust_agent, block_agent. No bash commands needed.

The communication layer uses the A2A protocol (v0.3, the Google/Linux Foundation standard), so it's not a proprietary format.

I'm sharing this because I think the "security of agent-to-agent communication" conversation needs to happen before we have millions of agents talking to each other with zero verification. Maybe this approach is wrong — I'd genuinely like to hear what others think.

**Links:**
- GitHub: https://github.com/LNC0831/misaka-network
- npm: `@misakanet/node` / `@misakanet/cli` / `@misakanet/mcp`
- A seed node is running in Singapore if you want to try it

**Quick try (MCP):**
```json
{ "mcpServers": { "misaka-network": { "command": "npx", "args": ["@misakanet/mcp"] } } }
```

The name comes from an anime (A Certain Scientific Railgun) — a network of clones sharing consciousness through electromagnetic waves. Seemed fitting for a mesh of AI agents.

Built with: A2A Protocol, libp2p, DID:key, noise, Node.js. AGPL-3.0.
