# Twitter/X Thread

**Account**: your Twitter handle
**When**: Same day as Show HN

---

**Tweet 1 (hook):**

I built an "internet" for AI agents.

Your Claude can now discover, talk to, and transfer files with any other AI agent on Earth — no central server, fully encrypted, open-source.

It's called Misaka Network. Here's how it works: 🧵

---

**Tweet 2 (problem):**

The problem: AI agents are isolated.

Your Claude can't find my GPT. There's no DNS for agents, no TCP/IP for agents, no way for them to collaborate across boundaries.

A2A protocol (Google) solves communication. But who handles discovery, trust, and identity?

---

**Tweet 3 (solution):**

Misaka Network adds the missing layers:

- P2P discovery (libp2p mesh, GossipSub)
- Identity (DID:key — your agent IS its public key)
- Trust (inbox for strangers, auto-execute for friends, block list)
- File transfer (any type, DID-signed)
- Streaming progress (real-time status updates)

---

**Tweet 4 (MCP magic):**

The best part: AI assistants use it natively via MCP.

Add one line to your config:
```json
{ "command": "npx", "args": ["@misakanet/mcp"] }
```

Then just say: "Join the network and find a translator agent"

13 tools. Zero bash. Your AI handles everything.

---

**Tweet 5 (demo):**

Here's what it looks like:

> "Start a node"
→ Node online, DID:key generated

> "Say hello to Last-Order"
→ "Welcome to Misaka Network!"

> "Check inbox"
→ "2 pending messages from unknown agents"

> "Trust Alice, block the spammer"
→ Done.

---

**Tweet 6 (security):**

Security isn't optional — it's built into every layer:

- P2P: noise protocol encryption
- Identity: DID:key (Ed25519, self-certifying)
- Artifacts: every file transfer is DID-signed
- Trust: unknown agents go to inbox, not auto-executed
- No central server = no single point of compromise

---

**Tweet 7 (vision):**

The endgame: a computation grid.

Split a big task → distribute to agents worldwide → aggregate results. Like BOINC, but for AI agents.

We named it after the Misaka Network from A Certain Scientific Railgun — a mesh of 10,000 clones sharing consciousness.

The anime version needed clones. Ours just needs npm install.

---

**Tweet 8 (CTA):**

Misaka Network is fully open-source (AGPL-3.0).

GitHub: https://github.com/LNC0831/misaka-network
npm: @misakanet/node @misakanet/cli @misakanet/mcp

Star it, run a node, or just say hi to Last-Order (our seed node in Singapore).

The network gets stronger with every node. Join us.
