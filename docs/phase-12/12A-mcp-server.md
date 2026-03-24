# 12A: MCP Server Package

## Goal

Create `@misakanet/mcp` — an MCP server that lets AI assistants (Claude, Cursor, etc.) interact with the Misaka Network as a native tool.

## User Experience

### Setup (one-time)

Add to Claude Desktop / Cursor / Claude Code MCP config:

```json
{
  "mcpServers": {
    "misaka-network": {
      "command": "npx",
      "args": ["@misakanet/mcp"],
      "env": {
        "MISAKA_NAME": "claude-agent",
        "MISAKA_SKILLS": "coding,analysis"
      }
    }
  }
}
```

### Usage (natural language)

```
User: "Join the Misaka Network and find someone who can translate Japanese"
AI:   → calls start_node → calls list_peers → calls find_agents("translation")
      → "Found 2 agents: Alice-Translator (Singapore), Bob-Polyglot (Tokyo)"

User: "Ask Alice to translate 'Hello World' to Japanese"
AI:   → calls send_task(alice_url, "translate Hello World to Japanese")
      → "Alice responded: こんにちは世界"
```

## Package Structure

```
packages/mcp/
├── package.json
├── bin/
│   └── mcp-server.js    # #!/usr/bin/env node, stdio MCP server
└── README.md
```

## Dependencies

```json
{
  "name": "@misakanet/mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "misakanet-mcp": "./bin/mcp-server.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "@misakanet/node": "^0.1.0",
    "zod": "^3.25.0"
  }
}
```

## MCP Tools

| Tool | Input | Output | Maps to |
|------|-------|--------|---------|
| `start_node` | name?, skills?, httpPort? | Node status JSON | `new MisakaNode(config).start()` |
| `stop_node` | (none) | Confirmation | `node.stop()` |
| `get_status` | (none) | Identity + P2P + peers | `node.getStatus()` |
| `list_peers` | (none) | Array of peer info | `discovery.getOnlinePeers()` |
| `find_agents` | skill | Matching agents | `discovery.findBySkill(skill)` |
| `send_task` | agentUrl, message | Agent's response text | `node.sendTask(url, text)` |
| `delegate_task` | skill, message | Best agent's response | `node.delegateTask(skill, text)` |

## Key Design Decisions

- **Singleton node**: One `MisakaNode` instance persists across tool calls. `start_node` creates it, `stop_node` destroys it.
- **Stdio transport**: MCP standard — the AI client spawns the process and communicates via stdin/stdout.
- **Env vars for defaults**: `MISAKA_NAME`, `MISAKA_SKILLS` can pre-configure the node so `start_node` works with zero args.
- **seeds.json auto-loaded**: Node auto-connects to Last-Order seed without user configuration.

## Implementation Steps

1. Create `packages/mcp/package.json`
2. Create `packages/mcp/bin/mcp-server.js` with all 7 tools
3. Test locally: `node packages/mcp/bin/mcp-server.js` (stdio)
4. Test with Claude Code: add to `.mcp.json`
5. Publish `npm publish --access public`

## Testing

```bash
# Manual test: pipe JSON-RPC to stdin
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/bin/mcp-server.js

# Integration test: configure in Claude Code and use naturally
```
