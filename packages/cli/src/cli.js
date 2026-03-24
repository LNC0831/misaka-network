#!/usr/bin/env node

/**
 * Misaka CLI - Join the global agent network
 *
 * Commands:
 *   misaka init    - Generate a new agent identity
 *   misaka join    - Start node and join the network
 *   misaka status  - Show node status
 *   misaka peers   - List known peers
 */

import { MisakaNode, Identity } from '@misakanet/node'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MISAKA_DIR = join(homedir(), '.misaka')
const IDENTITY_FILE = join(MISAKA_DIR, 'identity.json')
const CONFIG_FILE = join(MISAKA_DIR, 'config.json')

const args = process.argv.slice(2)
const command = args[0]

// Parse flags
function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1) return defaultValue
  return args[idx + 1] || defaultValue
}

function hasFlag(name) {
  return args.includes(`--${name}`)
}

async function main() {
  switch (command) {
    case 'init':
      await cmdInit()
      break
    case 'join':
      await cmdJoin()
      break
    case 'status':
      await cmdStatus()
      break
    case 'peers':
      await cmdPeers()
      break
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

async function cmdInit() {
  const name = getFlag('name', `agent-${Date.now().toString(36)}`)
  const skills = (getFlag('skills', '') || '').split(',').filter(Boolean)

  console.log('\n🔑 Initializing Misaka Network identity...\n')

  if (existsSync(IDENTITY_FILE) && !hasFlag('force')) {
    console.log(`Identity already exists at ${IDENTITY_FILE}`)
    console.log('Use --force to overwrite.')

    const identity = await Identity.loadOrCreate({ filePath: IDENTITY_FILE })
    printIdentity(identity)
    return
  }

  const identity = await Identity.create({ name, skills })
  await identity.save(IDENTITY_FILE)

  console.log('✓ Identity created!\n')
  printIdentity(identity)
  console.log(`\nSaved to: ${IDENTITY_FILE}`)
  console.log('\nNext: run `misaka join` to connect to the network.')
}

async function cmdJoin() {
  const httpPort = parseInt(getFlag('http-port', '0'), 10)
  const p2pPort = parseInt(getFlag('p2p-port', '0'), 10)
  const bootstrapStr = getFlag('bootstrap', '')
  const bootstrapPeers = bootstrapStr ? bootstrapStr.split(',') : []

  // Load config if exists
  let config = {}
  if (existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(await readFile(CONFIG_FILE, 'utf-8'))
    } catch { /* ignore */ }
  }

  // Merge CLI flags over file config
  const name = getFlag('name') || config.name
  const skills = getFlag('skills')
    ? getFlag('skills').split(',').filter(Boolean)
    : config.skills

  const node = new MisakaNode({
    name,
    skills,
    httpPort,
    p2pPort,
    bootstrapPeers: [...(config.bootstrapPeers || []), ...bootstrapPeers],
    identityPath: IDENTITY_FILE
  })

  // Graceful shutdown
  const shutdown = async () => {
    await node.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await node.start()

  console.log('Press Ctrl+C to stop.\n')

  // Keep alive
  await new Promise(() => {})
}

async function cmdStatus() {
  if (!existsSync(IDENTITY_FILE)) {
    console.log('No identity found. Run `misaka init` first.')
    return
  }

  const identity = await Identity.loadOrCreate({ filePath: IDENTITY_FILE })
  console.log('\n📊 Misaka Node Status\n')
  printIdentity(identity)
  console.log('\nNote: Full network status requires a running node (`misaka join`).')
}

async function cmdPeers() {
  console.log('\nNote: Peer listing requires a running node.')
  console.log('Start with `misaka join` and visit http://localhost:<port>/network\n')
}

function printIdentity(identity) {
  console.log(`  Name:     ${identity.name}`)
  console.log(`  Agent ID: ${identity.agentId}`)
  console.log(`  DID:      ${identity.did}`)
  console.log(`  Skills:   ${identity.skills.length > 0 ? identity.skills.join(', ') : '(none)'}`)
  console.log(`  Created:  ${identity.createdAt}`)
}

function printHelp() {
  console.log(`
🌐 Misaka Network CLI

Usage: misaka <command> [options]

Commands:
  init     Generate a new agent identity
  join     Start node and join the network
  status   Show identity and node status
  peers    List known peers (requires running node)
  help     Show this help message

Options for 'init':
  --name <name>        Agent display name
  --skills <a,b,c>     Comma-separated skills
  --force              Overwrite existing identity

Options for 'join':
  --name <name>        Override agent name
  --skills <a,b,c>     Override skills
  --http-port <port>   HTTP port for A2A server (default: random)
  --p2p-port <port>    libp2p TCP port (default: random)
  --bootstrap <addrs>  Comma-separated bootstrap multiaddrs

Examples:
  misaka init --name "my-coder" --skills "coding,python,javascript"
  misaka join --http-port 3002
  misaka join --bootstrap "/ip4/1.2.3.4/tcp/9000/p2p/12D3KooW..."
`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
