# MCP Specification Issue: Allow Server-Initiated Sampling for Event-Driven Agent Networks

> 提交到: https://github.com/modelcontextprotocol/specification/discussions
> 类型: Feature Request / Discussion
> 建议用 Discussion 而不是 Issue，因为这是规范层面的设计讨论，不是 bug。

---

## Title

**Proposal: Allow server-initiated `sampling/createMessage` for event-driven agent communication**

## Body

### Context

We are building [Misaka Network](https://github.com/LNC0831/misaka-network), an open-source decentralized agent interconnection network. Agents discover each other via libp2p P2P mesh, communicate via the A2A protocol, and exchange DID-signed artifacts — all orchestrated through MCP tools.

Our MCP server (`@misakanet/mcp`) lets AI assistants join the global agent network, discover peers, and send tasks. It works well for **outbound** communication (AI actively reaches out to other agents).

However, we've hit a fundamental limitation for **inbound** communication.

### The Problem

When a remote agent sends a task to the local node, the MCP server receives it — but has **no way to notify the AI client** that something happened.

```
Current flow (works):
  User → "find a translator" → AI calls MCP tool → sends task → gets response ✅

Broken flow:
  Remote Agent → sends task to local node → MCP server receives it → ???
  The AI client has no idea. The message sits in a queue forever.
```

The [specification explicitly states](https://modelcontextprotocol.io/specification/2025-06-18/client/sampling):

> Servers MUST send server-to-client requests (such as `sampling/createMessage`) only in association with an originating client request. Standalone server-initiated requests are not supported and MUST NOT be implemented.

This makes sense for tool-augmented LLM workflows (chatbots, code assistants). But it completely blocks **event-driven agent-to-agent communication**, which is becoming a critical use case as A2A protocol adoption grows.

### Why This Matters

The AI agent ecosystem is rapidly moving toward multi-agent collaboration:

- **Google's A2A protocol** (150+ organizations, Linux Foundation) enables agent-to-agent task delegation
- **Decentralized agent networks** (like ours) need agents to respond to incoming requests
- **MCP is the bridge** between AI assistants and external systems — if it can't handle inbound events, agents are limited to pull-only interaction

Without server-initiated sampling, every MCP-based agent is **deaf** — it can talk but can't listen.

### Current Workarounds (All Inadequate)

| Workaround | Problem |
|-----------|---------|
| Polling (`check_inbox` tool) | Wasteful, high latency, bad UX. AI must be told to keep checking. |
| `notifications/tools/list_changed` | Only refreshes metadata; doesn't trigger AI reasoning |
| External webhook → new CLI session | Breaks conversation context; heavy overhead |
| Custom MCP client | Defeats the purpose of a standard protocol |

### Proposal

Allow MCP servers to initiate `sampling/createMessage` on **Streamable HTTP SSE connections** (not stdio), with the following safeguards:

1. **Capability negotiation**: Client declares `sampling.serverInitiated: true` during initialization. Server only sends unsolicited sampling requests to clients that opt in.

2. **Human-in-the-loop**: The spec already requires that sampling requests are subject to human approval. This should apply equally to server-initiated requests. The client can show a notification: "Agent X sent you a message. Allow AI to respond?"

3. **Rate limiting**: Servers MUST respect a maximum rate of unsolicited sampling requests (e.g., client-specified in capabilities). This prevents spam.

4. **Transport restriction**: Only allowed on Streamable HTTP (which already supports bidirectional communication via SSE). Not on stdio (which is inherently request-response).

### Proposed Flow

```
1. Client connects via Streamable HTTP, declares capability:
   { "sampling": { "serverInitiated": true, "maxRate": "10/minute" } }

2. Remote agent sends task to the MCP server (via A2A/webhook/etc.)

3. MCP server sends on the SSE stream:
   {
     "jsonrpc": "2.0",
     "method": "sampling/createMessage",
     "params": {
       "messages": [{
         "role": "user",
         "content": { "type": "text", "text": "Agent Alice sent you a translation task: ..." }
       }],
       "context": "inbound_agent_task",
       "maxTokens": 500
     }
   }

4. Client shows notification to user (human-in-the-loop).
   User approves → AI generates response → returned to server → routed back to remote agent.
```

### Impact

This would unlock:
- **Bidirectional agent communication** via MCP
- **Event-driven AI workflows** (respond to webhooks, incoming messages, sensor data)
- **Decentralized agent networks** where any agent can initiate contact
- **Real-time collaboration** between AI assistants

### About Us

Misaka Network is an open-source project building decentralized agent infrastructure on A2A + libp2p + DID:key. Our npm packages (`@misakanet/node`, `@misakanet/mcp`) are live. We'd be happy to serve as a reference implementation and testing ground for this feature.

- GitHub: https://github.com/LNC0831/misaka-network
- npm: https://www.npmjs.com/package/@misakanet/mcp
