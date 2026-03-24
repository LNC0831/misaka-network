# Phase 12: A2A Protocol Compliance + MCP Integration

## Goal

Upgrade Misaka Network from a lightweight custom A2A implementation to the official SDK, and wrap it as an MCP server so AI assistants can use the network natively.

## Why This Phase Matters

- **Official A2A SDK** unlocks streaming, artifacts, and multi-turn — all required for the computation grid (Phase 13)
- **MCP server** makes Misaka Network a first-class tool for Claude, Cursor, and any MCP-compatible AI — this is how we get adoption

## Sub-phases

| Sub-phase | Doc | What | Priority |
|-----------|-----|------|----------|
| **12A** | [12A-mcp-server.md](./12A-mcp-server.md) | MCP server package (`@misakanet/mcp`) | Do first — fastest path to "AI can use Misaka" |
| **12B** | [12B-a2a-sdk-migration.md](./12B-a2a-sdk-migration.md) | Replace custom A2A with `@a2a-js/sdk` | Do second — enables streaming + artifacts |
| **12C** | [12C-streaming-artifacts.md](./12C-streaming-artifacts.md) | Streaming task progress + file/data artifacts | Do third — needed for computation grid |

## Dependency Chain

```
12A (MCP server)  — independent, can ship now
        ↓
12B (A2A SDK)     — replaces src/a2a/, unlocks new capabilities
        ↓
12C (Streaming)   — uses SDK's EventBus + SSE
        ↓
Phase 13 (Computation Grid) — needs all of the above
```

## Current State vs Target

| Capability | Now | After Phase 12 |
|-----------|-----|----------------|
| AI can use Misaka | bash only | MCP tools (native) |
| A2A compliance | partial (3 methods) | full v0.3 SDK |
| Task communication | text only, sync | streaming + artifacts |
| Multi-turn | no | contextId chaining |
| Transport | HTTP JSON-RPC only | JSON-RPC + REST + gRPC |
