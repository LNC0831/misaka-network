#!/usr/bin/env node

/**
 * Misaka Network MCP Server
 *
 * Exposes the Misaka Network as MCP tools for AI assistants
 * (Claude Desktop, Cursor, Claude Code, etc.)
 *
 * Usage in MCP config:
 *   { "command": "npx", "args": ["@misakanet/mcp"] }
 *
 * Environment variables:
 *   MISAKA_NAME    — Agent display name (default: "claude-agent")
 *   MISAKA_SKILLS  — Comma-separated skills (default: "general")
 *   MISAKA_PORT    — HTTP port for A2A server (default: 0 = random)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { MisakaNode } from '../../node/src/index.js'

// Singleton node instance — persists across tool calls
let node = null

const server = new McpServer({
  name: 'misaka-network',
  version: '0.1.0',
})

// ─── start_node ─────────────────────────────────────────────

server.tool(
  'start_node',
  'Start a Misaka Network P2P agent node. Joins the global decentralized agent network so you can discover and communicate with other AI agents worldwide.',
  {
    name: z.string().optional().describe('Agent display name'),
    skills: z.array(z.string()).optional().describe('Agent skills, e.g. ["coding", "translation"]'),
    httpPort: z.number().optional().describe('HTTP port for A2A server (0 = random)'),
  },
  async ({ name, skills, httpPort }) => {
    if (node?.started) {
      const status = node.getStatus()
      return {
        content: [{
          type: 'text',
          text: `Node is already running as "${status.name}" (${status.did}). Use get_status for details or stop_node to restart.`
        }]
      }
    }

    node = new MisakaNode({
      name: name || process.env.MISAKA_NAME || 'claude-agent',
      skills: skills || (process.env.MISAKA_SKILLS || 'general').split(',').filter(Boolean),
      httpPort: httpPort || parseInt(process.env.MISAKA_PORT || '0', 10),
    })

    const status = await node.start()

    return {
      content: [{
        type: 'text',
        text: [
          `Node started successfully!`,
          `  Name: ${status.name}`,
          `  DID: ${status.did}`,
          `  A2A: ${status.http.url}`,
          `  P2P ID: ${status.p2p.peerId}`,
          `  Peers: ${status.discovery.knownPeers}`,
        ].join('\n')
      }]
    }
  }
)

// ─── stop_node ──────────────────────────────────────────────

server.tool(
  'stop_node',
  'Stop the running Misaka Network node gracefully. Disconnects from all peers.',
  {},
  async () => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running.' }] }
    }
    const name = node.config.name
    await node.stop()
    node = null
    return { content: [{ type: 'text', text: `Node "${name}" stopped.` }] }
  }
)

// ─── get_status ─────────────────────────────────────────────

server.tool(
  'get_status',
  'Get the current status of the Misaka node: identity (DID), P2P connections, discovered peers, network info.',
  {},
  async () => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    const status = node.getStatus()
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
  }
)

// ─── list_peers ─────────────────────────────────────────────

server.tool(
  'list_peers',
  'List all discovered online agents in the Misaka Network, including their names, skills, and A2A endpoints.',
  {},
  async () => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    const peers = node.discovery.getOnlinePeers()
    if (peers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No peers discovered yet. The node may still be connecting to the network. Try again in a few seconds.'
        }]
      }
    }
    const result = peers.map(p => ({
      name: p.name,
      agentId: p.agentId,
      skills: p.skills,
      a2aUrl: p.a2aUrl,
    }))
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── find_agents ────────────────────────────────────────────

server.tool(
  'find_agents',
  'Find agents on the Misaka Network that have a specific skill.',
  {
    skill: z.string().describe('The skill to search for (e.g. "coding", "translation")'),
  },
  async ({ skill }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    const agents = node.discovery.findBySkill(skill)
    if (agents.length === 0) {
      return { content: [{ type: 'text', text: `No agents found with skill "${skill}". Known skills: ${node.discovery.getKnownSkills().join(', ') || '(none yet)'}` }] }
    }
    const result = agents.map(a => ({
      name: a.name,
      agentId: a.agentId,
      skills: a.skills,
      a2aUrl: a.a2aUrl,
    }))
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

// ─── send_task ──────────────────────────────────────────────

server.tool(
  'send_task',
  'Send an A2A task (text message) to a specific agent by their URL. Returns the agent\'s response.',
  {
    agentUrl: z.string().describe('The A2A URL of the target agent (e.g. http://host:port)'),
    message: z.string().describe('The task/message text to send to the agent'),
  },
  async ({ agentUrl, message }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    try {
      const result = await node.sendTask(agentUrl, message)
      const text = (result.parts || [])
        .filter(p => p.kind === 'text')
        .map(p => p.text)
        .join('\n')
      return { content: [{ type: 'text', text: text || JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Task failed: ${err.message}` }] }
    }
  }
)

// ─── delegate_task ──────────────────────────────────────────

server.tool(
  'delegate_task',
  'Find an agent with the given skill and send them a task. Automatically picks the best available agent on the network.',
  {
    skill: z.string().describe('Required skill (e.g. "translation", "coding")'),
    message: z.string().describe('The task/message to delegate'),
  },
  async ({ skill, message }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    try {
      const result = await node.delegateTask(skill, message)
      const text = (result.parts || [])
        .filter(p => p.kind === 'text')
        .map(p => p.text)
        .join('\n')
      return { content: [{ type: 'text', text: text || JSON.stringify(result, null, 2) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Delegation failed: ${err.message}` }] }
    }
  }
)

// ─── check_inbox ────────────────────────────────────────────

server.tool(
  'check_inbox',
  'Check your inbox for pending messages from other agents. Unknown agents\' tasks land here for your review.',
  {},
  async () => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    const pending = node.inbox.listPending()
    if (pending.length === 0) {
      return { content: [{ type: 'text', text: 'Inbox is empty. No pending messages.' }] }
    }
    const summary = pending.map((m, i) => {
      const trust = node.trustList.getTrust(m.from.did)
      return `${i + 1}. [${trust.toUpperCase()}] ${m.from.name} (${m.from.did?.slice(0, 30) || 'no DID'}...)\n   Message: "${m.input.slice(0, 100)}${m.input.length > 100 ? '...' : ''}"\n   ID: ${m.id}\n   Received: ${m.receivedAt}`
    }).join('\n\n')
    return { content: [{ type: 'text', text: `📬 ${pending.length} pending message(s):\n\n${summary}` }] }
  }
)

// ─── accept_task ────────────────────────────────────────────

server.tool(
  'accept_task',
  'Accept a pending task from the inbox and execute it. Returns the result.',
  {
    messageId: z.string().describe('The message ID from check_inbox'),
  },
  async ({ messageId }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    try {
      const msg = node.inbox.accept(messageId)

      // Execute with the node's executor
      const executor = node.config.executor
      const result = await executor({ taskId: messageId, input: msg.input, message: msg.message })
      const responseText = typeof result === 'string' ? result : JSON.stringify(result)

      return { content: [{ type: 'text', text: `Task accepted and executed.\n\nFrom: ${msg.from.name}\nInput: "${msg.input.slice(0, 100)}"\nResult: ${responseText}` }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed: ${err.message}` }] }
    }
  }
)

// ─── reject_task ────────────────────────────────────────────

server.tool(
  'reject_task',
  'Reject a pending task from the inbox.',
  {
    messageId: z.string().describe('The message ID from check_inbox'),
    reason: z.string().optional().describe('Optional reason for rejection'),
  },
  async ({ messageId, reason }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    try {
      const msg = node.inbox.reject(messageId, reason)
      return { content: [{ type: 'text', text: `Rejected task from ${msg.from.name}.${reason ? ' Reason: ' + reason : ''}` }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed: ${err.message}` }] }
    }
  }
)

// ─── trust_agent ────────────────────────────────────────────

server.tool(
  'trust_agent',
  'Add an agent to your trust list. Trusted agents\' tasks will be auto-executed without inbox review.',
  {
    did: z.string().describe('The DID of the agent to trust (e.g. did:key:z6Mk...)'),
    note: z.string().optional().describe('Optional note about this agent'),
  },
  async ({ did, note }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    await node.trustList.setTrust(did, 'trusted', { note })
    return { content: [{ type: 'text', text: `Agent ${did.slice(0, 30)}... is now TRUSTED. Their tasks will be auto-executed.` }] }
  }
)

// ─── block_agent ────────────────────────────────────────────

server.tool(
  'block_agent',
  'Block an agent. All requests from blocked agents will be refused.',
  {
    did: z.string().describe('The DID of the agent to block'),
  },
  async ({ did }) => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    await node.trustList.setTrust(did, 'blocked')
    return { content: [{ type: 'text', text: `Agent ${did.slice(0, 30)}... is now BLOCKED. All their requests will be refused.` }] }
  }
)

// ─── list_contacts ──────────────────────────────────────────

server.tool(
  'list_contacts',
  'List all known agents and their trust levels (trusted, blocked, or unknown).',
  {},
  async () => {
    if (!node?.started) {
      return { content: [{ type: 'text', text: 'No node is running. Use start_node first.' }] }
    }
    const contacts = node.trustList.list()
    if (contacts.length === 0) {
      return { content: [{ type: 'text', text: 'No contacts yet. Agents appear here after interacting with your node.' }] }
    }
    const summary = contacts.map(a =>
      `[${a.trust.toUpperCase()}] ${a.name} — ${a.did.slice(0, 40)}...\n  Tasks: ${a.taskCount} | Last: ${a.lastInteraction?.slice(0, 10) || 'never'}${a.note ? ' | Note: ' + a.note : ''}`
    ).join('\n\n')
    return { content: [{ type: 'text', text: `📇 ${contacts.length} contact(s):\n\n${summary}` }] }
  }
)

// ─── Connect stdio transport ────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
