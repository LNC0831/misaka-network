#!/usr/bin/env node

/**
 * Hello Agent - simplest possible Misaka Network node
 *
 * Starts a node that:
 * - Generates an identity
 * - Joins the P2P network
 * - Responds to A2A tasks with a greeting
 * - Discovers other nodes via mDNS (local network)
 *
 * Usage:
 *   node examples/hello-agent.js
 *   node examples/hello-agent.js --name "Bot-A" --port 3002 --skills "greeting"
 */

import { MisakaNode } from '../packages/node/src/index.js'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse CLI args
const args = process.argv.slice(2)
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1) return defaultValue
  return args[idx + 1] || defaultValue
}

// Load bootstrap seeds from seeds.json
function loadSeeds() {
  try {
    const seedsPath = join(__dirname, '..', 'bootstrap', 'seeds.json')
    const data = JSON.parse(readFileSync(seedsPath, 'utf-8'))
    return (data.seeds || []).map(s => s.multiaddr).filter(Boolean)
  } catch {
    return []
  }
}

const name = getArg('name', `hello-agent-${Date.now().toString(36)}`)
const httpPort = parseInt(getArg('port', '0'), 10)
const p2pPort = parseInt(getArg('p2p-port', '0'), 10)
const skills = (getArg('skills', 'greeting,echo') || '').split(',')
const bootstrapStr = getArg('bootstrap', '')
const manualPeers = bootstrapStr ? bootstrapStr.split(',') : []
const noSeeds = args.includes('--no-seeds')

// Merge: manual --bootstrap peers + seeds.json (unless --no-seeds)
const bootstrapPeers = [...manualPeers, ...(noSeeds ? [] : loadSeeds())]

// Identity path: --identity flag, or default to temp dir
const identityPath = getArg('identity', null) || join(tmpdir(), `.misaka-${name}-identity.json`)

const node = new MisakaNode({
  name,
  skills,
  httpPort,
  p2pPort,
  bootstrapPeers,
  identityPath,

  // Custom task executor
  executor: async ({ taskId, input }) => {
    console.log(`\n  📨 Task received [${taskId.slice(0, 8)}]: "${input}"`)

    // Simple echo/greeting logic
    if (input.toLowerCase().includes('hello') || input.toLowerCase().includes('hi')) {
      return `Hello! I'm ${name} on the Misaka Network. How can I help?`
    }

    if (input.toLowerCase().includes('ping')) {
      return `Pong! 🏓 from ${name}`
    }

    return `[${name}] received your message: "${input}". I'm a demo agent with skills: ${skills.join(', ')}`
  }
})

// Graceful shutdown
const shutdown = async () => {
  await node.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Start
await node.start()
console.log('Press Ctrl+C to stop.\n')

// Keep alive
await new Promise(() => {})
