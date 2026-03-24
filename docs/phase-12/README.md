# Phase 12: A2A Protocol Compliance + MCP Integration

## Goal

Build a **complete secure task execution pipeline** between agents: AI-native access (MCP), official A2A protocol, streaming progress, file transfer, and DID:key signed artifacts.

## Why This Phase Matters

- **MCP server** → AI assistants can use Misaka Network as a native tool (Claude, Cursor, etc.)
- **Official A2A SDK** → protocol-compliant communication, streaming, artifacts
- **Secure pipeline** → noise encryption + DID:key signing end-to-end
- **Visible progress** → real-time task status, not just "wait and pray"
- All of the above → required foundation for the computation grid (Phase 13)

## Sub-phases

| Sub-phase | Doc | What | Status |
|-----------|-----|------|--------|
| **12A** | [12A-mcp-server.md](./12A-mcp-server.md) | MCP server (`@misakanet/mcp`, 7 tools) | ✅ Done, npm published |
| **12B** | [12B-a2a-sdk-migration.md](./12B-a2a-sdk-migration.md) | Replace custom A2A with `@a2a-js/sdk@0.3.13` | ✅ Done, verified |
| **12C** | [12C-streaming-artifacts.md](./12C-streaming-artifacts.md) | Streaming + file transfer + artifact signing | ✅ Done |
| **12D** | [12D-connection-inbox.md](./12D-connection-inbox.md) | Connection management + inbox + trust list | Next |

## Dependency Chain

```
12A (MCP server)   ✅  — AI assistants can call tools
        ↓
12B (A2A SDK)      ✅  — official protocol compliance
        ↓
12C (Streaming)    ✅  — secure pipeline: progress + files + signing
        ↓
12D (Inbox)             — bidirectional: inbox + trust + connection management
        ↓
Phase 13 (Grid)         — distributed computation needs all of the above
```

## Current State vs Target

| Capability | Before Phase 12 | Now (12A+12B) | After 12C |
|-----------|-----------------|---------------|-----------|
| AI access | bash only | ✅ MCP tools | MCP + streaming tools |
| A2A protocol | custom 3 methods | ✅ SDK v0.3.13 | SDK + SSE streaming |
| Task data | text only | text only | text + file + structured data |
| Progress | none | none | real-time status events |
| Security | noise P2P + DID:key | same | + artifact DID signing |
| Transport | JSON-RPC only | ✅ JSON-RPC + REST | + SSE streaming |

## Key Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| SDK executor mode | Message (simple) vs Task (streaming) | Auto-detect: `executor.length >= 2` → Task mode, else Message mode |
| Artifact signing | DID:key Ed25519 per-artifact | Self-certifying, no CA needed, matches existing identity system |
| Streaming transport | SSE (Server-Sent Events) | A2A v0.3 standard, SDK built-in, works through HTTP proxies |
| Backward compatibility | Old `() => string` executors still work | Zero breaking changes for existing users |
