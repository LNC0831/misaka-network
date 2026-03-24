# 12C: Streaming + Artifacts

## Goal

Enable streaming task progress and structured data exchange between agents. This is the foundation for the computation grid (Phase 13).

## Depends on

- 12B (A2A SDK migration) must be complete

## Why This Matters for Phase 13

Computation grid needs:
- **Streaming**: Coordinator sees subtask progress in real-time, not just final results
- **Artifacts**: Subtask results may be files, JSON data, code — not just text
- **Status updates**: submitted → working → completed with intermediate states

## Capabilities to Enable

### 1. Streaming Task Execution

```javascript
// Agent executor with streaming progress
const node = new MisakaNode({
  executor: async ({ taskId, input }, eventBus) => {
    // Report progress
    eventBus.status('working', 'Analyzing input...')

    // Do work...
    await someWork()

    // Emit intermediate artifact
    eventBus.artifact('partial-result', {
      kind: 'data',
      data: { progress: 50, partialResult: '...' }
    })

    // More work...
    await moreWork()

    // Final result
    eventBus.artifact('final-result', {
      kind: 'text',
      text: 'Complete result here'
    })

    eventBus.complete()
  }
})
```

### 2. Client-side Streaming

```javascript
// Watch a remote agent's progress
for await (const event of node.sendTaskStream(url, text)) {
  if (event.kind === 'status-update') {
    console.log(`Progress: ${event.status.state}`)
  }
  if (event.kind === 'artifact-update') {
    console.log(`Got artifact: ${event.artifact.name}`)
  }
}
```

### 3. Artifact Types

| Type | Use case in computation grid |
|------|------------------------------|
| `text` | Natural language results, code |
| `file` | Binary outputs (images, compiled code, models) |
| `data` | Structured JSON (metrics, partial results, configs) |

## API Changes

### MisakaNode

```javascript
// New: streaming send
node.sendTaskStream(url, text)  // Returns AsyncIterable<Event>

// New: executor gets eventBus parameter
executor: async ({ taskId, input }, eventBus) => {
  eventBus.status(state, message?)
  eventBus.artifact(name, part)
  eventBus.complete()
}
```

### Backward Compatibility

Old-style executors (return string) still work — automatically wrapped as a non-streaming single-response.

## Implementation Steps

1. Extend executor interface to accept optional eventBus
2. Add `sendTaskStream()` to MisakaNode using SDK's `sendMessageStream()`
3. Create helper functions for eventBus (status, artifact, complete)
4. Add streaming example: `examples/streaming-agent.js`
5. Test with Dashboard (show live task progress)
