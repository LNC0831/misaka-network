# 12B: A2A Official SDK Migration

## Goal

Replace our custom A2A implementation (`packages/node/src/a2a/index.js`) with the official `@a2a-js/sdk@0.3.13`.

## Why

Our custom implementation only covers 3 methods (message/send, tasks/get, tasks/cancel). The official SDK provides:

- Streaming via SSE (`message/stream`)
- Artifacts (files, structured data)
- Multi-turn conversations (contextId chaining)
- REST + gRPC transports
- Proper TaskStore with event lifecycle
- Agent Card signing

## Migration Plan

### What stays the same
- Express as HTTP server
- Agent Card structure (compatible with SDK format)
- CORS middleware
- `/health` and `/network` custom endpoints

### What changes

| Current (custom) | New (SDK) |
|-------------------|-----------|
| Manual JSON-RPC parsing | `jsonRpcHandler()` from SDK |
| Custom `A2AServer` class | SDK's `DefaultRequestHandler` + `AgentExecutor` |
| Custom `A2AClient` class | SDK's `ClientFactory` |
| `executor: (input) => string` | `AgentExecutor.execute(ctx, eventBus)` |
| No streaming | SSE via `sendMessageStream()` |
| Text-only parts | text + file + data parts |

### Executor Interface Change

```javascript
// Before (current)
executor: async ({ taskId, input }) => {
  return 'response string'
}

// After (SDK)
class NodeExecutor {
  async execute(requestContext, eventBus) {
    const input = requestContext.userMessage.parts
      .filter(p => p.kind === 'text')
      .map(p => p.text)
      .join(' ')

    // Call the user's executor function (backward compatible)
    const result = await this.userExecutor({ taskId: requestContext.taskId, input })

    eventBus.publish({
      kind: 'message',
      messageId: randomUUID(),
      role: 'agent',
      parts: [{ kind: 'text', text: result }],
      contextId: requestContext.contextId
    })
    eventBus.finished()
  }
}
```

The wrapper preserves backward compatibility: users still pass `executor: ({input}) => string`, we wrap it in the SDK's `AgentExecutor` interface.

### Files to Change

| File | Change |
|------|--------|
| `packages/node/package.json` | Add `@a2a-js/sdk: ^0.3.13` |
| `packages/node/src/a2a/index.js` | Rewrite server/client using SDK |
| `packages/node/src/index.js` | Update A2A server setup in MisakaNode.start() |
| `examples/two-nodes.js` | May need minor updates |

### Backward Compatibility

The `MisakaNode` API stays the same:
```javascript
const node = new MisakaNode({
  executor: async ({ input }) => 'response'  // Still works
})
await node.sendTask(url, text)  // Still works
```

Internal wiring changes, public API doesn't.

## Implementation Steps

1. `npm install @a2a-js/sdk` in packages/node
2. Rewrite `src/a2a/index.js` — server uses SDK handlers, client uses ClientFactory
3. Add backward-compatible executor wrapper
4. Verify `two-nodes.js` demo still works
5. Verify Dashboard `/network` endpoint still works
6. Verify MCP server (12A) still works
