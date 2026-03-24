#!/usr/bin/env node

/**
 * Two Nodes Demo - demonstrates agent discovery and A2A communication
 *
 * This script:
 * 1. Starts Node A (a "translator" agent)
 * 2. Starts Node B (a "coder" agent)
 * 3. They discover each other via mDNS
 * 4. Node B sends an A2A task to Node A
 * 5. Node A responds
 *
 * Usage:
 *   node examples/two-nodes.js
 */

import { MisakaNode } from '../packages/node/src/index.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

console.log('═══════════════════════════════════════════════')
console.log('  Misaka Network - Two Nodes Demo')
console.log('  Two agents discover each other and exchange')
console.log('  tasks using the A2A protocol over P2P.')
console.log('═══════════════════════════════════════════════\n')

// --- Node A: Translator Agent ---
const nodeA = new MisakaNode({
  name: 'Alice-Translator',
  skills: ['translation', 'japanese', 'english'],
  httpPort: 3101,
  p2pPort: 9101,
  identityPath: join(tmpdir(), '.misaka-demo-alice.json'),

  executor: async ({ input }) => {
    // Simulate translation
    if (input.toLowerCase().includes('translate')) {
      return `🈯 Translation result: "${input}" → "これはデモ翻訳です" (This is a demo translation)`
    }
    return `[Alice-Translator] I can translate! Send me "translate: <text>"`
  }
})

// --- Node B: Coder Agent ---
const nodeB = new MisakaNode({
  name: 'Bob-Coder',
  skills: ['coding', 'python', 'javascript'],
  httpPort: 3102,
  p2pPort: 9102,
  identityPath: join(tmpdir(), '.misaka-demo-bob.json'),

  executor: async ({ input }) => {
    if (input.toLowerCase().includes('code')) {
      return `💻 Here's your code:\n\`\`\`python\nprint("Hello from Bob-Coder!")\n\`\`\``
    }
    return `[Bob-Coder] I can code! Send me "code: <description>"`
  }
})

// Graceful shutdown
const shutdown = async () => {
  console.log('\n\nShutting down...')
  await Promise.all([nodeA.stop(), nodeB.stop()])
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// --- Start both nodes ---
console.log('Step 1: Starting Node A (Alice-Translator)...\n')
await nodeA.start()

console.log('\nStep 2: Starting Node B (Bob-Coder)...\n')
await nodeB.start()

// --- Explicitly connect B → A via libp2p dial ---
console.log('\nStep 3: Connecting nodes via P2P...\n')

const nodeAAddrs = nodeA.network.getMultiaddrs()
const nodeALocalAddr = nodeAAddrs.find(a => a.includes('127.0.0.1')) || nodeAAddrs[0]
console.log(`  Node A address: ${nodeALocalAddr}`)

try {
  await nodeB.network.dial(nodeALocalAddr)
  console.log('  ✓ Node B connected to Node A via P2P!')
} catch (err) {
  console.log(`  ✗ P2P connection failed: ${err.message}`)
}

// Wait for connection + announce
await sleep(2000)

const connectedA = nodeA.network.getPeers().length
const connectedB = nodeB.network.getPeers().length
console.log(`\n  Node A: ${connectedA} P2P connection(s)`)
console.log(`  Node B: ${connectedB} P2P connection(s)`)

// Trigger announcements over the now-connected pubsub
nodeA.discovery._announcePresence().catch(() => {})
nodeB.discovery._announcePresence().catch(() => {})
await sleep(2000)

const peersA = nodeA.discovery.getOnlinePeers()
const peersB = nodeB.discovery.getOnlinePeers()
console.log(`  Node A discovered: ${peersA.length} peer(s) ${peersA.map(p => '→ ' + p.name).join(' ')}`)
console.log(`  Node B discovered: ${peersB.length} peer(s) ${peersB.map(p => '→ ' + p.name).join(' ')}`)

// --- Send A2A task: B → A ---
console.log('\n\nStep 4: Bob sends a translation task to Alice via A2A...\n')

try {
  const response = await nodeB.sendTask(
    `http://127.0.0.1:${nodeA.httpPort}`,
    'translate: Hello World to Japanese'
  )

  console.log('═══════════════════════════════════════════════')
  console.log('  ✅ A2A Task Completed!')
  console.log('═══════════════════════════════════════════════')
  console.log(`  From:     Bob-Coder`)
  console.log(`  To:       Alice-Translator`)
  console.log(`  Request:  "translate: Hello World to Japanese"`)
  console.log(`  Response: "${extractText(response)}"`)
  console.log('═══════════════════════════════════════════════\n')
} catch (err) {
  console.error('❌ Task failed:', err.message)
}

// --- Send A2A task: A → B ---
console.log('\nStep 5: Alice sends a coding task to Bob via A2A...\n')

try {
  const response = await nodeA.sendTask(
    `http://127.0.0.1:${nodeB.httpPort}`,
    'code: a function that adds two numbers'
  )

  console.log('═══════════════════════════════════════════════')
  console.log('  ✅ A2A Task Completed!')
  console.log('═══════════════════════════════════════════════')
  console.log(`  From:     Alice-Translator`)
  console.log(`  To:       Bob-Coder`)
  console.log(`  Request:  "code: a function that adds two numbers"`)
  console.log(`  Response: "${extractText(response)}"`)
  console.log('═══════════════════════════════════════════════\n')
} catch (err) {
  console.error('❌ Task failed:', err.message)
}

// --- Show final network status ---
console.log('\n📊 Final Network Status:')
console.log('─'.repeat(50))

const statusA = nodeA.getStatus()
const statusB = nodeB.getStatus()

console.log(`\nNode A (${statusA.name}):`)
console.log(`  DID:      ${statusA.did}`)
console.log(`  HTTP:     ${statusA.http.url}`)
console.log(`  P2P ID:   ${statusA.p2p.peerId}`)
console.log(`  Peers:    ${statusA.discovery.knownPeers}`)

console.log(`\nNode B (${statusB.name}):`)
console.log(`  DID:      ${statusB.did}`)
console.log(`  HTTP:     ${statusB.http.url}`)
console.log(`  P2P ID:   ${statusB.p2p.peerId}`)
console.log(`  Peers:    ${statusB.discovery.knownPeers}`)

console.log('\n\n✨ Demo complete! Both nodes are still running.')
console.log('   Visit http://127.0.0.1:3101/network and http://127.0.0.1:3102/network')
console.log('   Press Ctrl+C to stop.\n')

// Keep alive
await new Promise(() => {})

/**
 * Extract text from A2A response
 */
function extractText(response) {
  if (!response) return '(no response)'
  if (typeof response === 'string') return response
  if (response.parts) {
    return response.parts
      .filter(p => p.kind === 'text')
      .map(p => p.text)
      .join(' ')
  }
  return JSON.stringify(response)
}
