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
import { MisakaNode } from '@misakanet/node'

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

// ─── Connect stdio transport ────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
