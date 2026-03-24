/**
 * MisakaNode - the main orchestrator
 *
 * Wires together: Identity + P2P Network + A2A Server/Client + Discovery
 *
 * Usage:
 *   const node = new MisakaNode({ name: 'my-agent', skills: ['coding'], port: 3002 })
 *   await node.start()
 *   // Node is now discoverable and can receive/send A2A tasks
 *   await node.stop()
 */

import { Identity } from './identity/index.js'
import { P2PNetwork } from './network/index.js'
import { A2AServer, A2AClient, createAgentCard } from './a2a/index.js'
import { Discovery } from './discovery/index.js'

export { Identity } from './identity/index.js'
export { P2PNetwork, TOPICS, DHT_PREFIX } from './network/index.js'
export { A2AServer, A2AClient, createAgentCard } from './a2a/index.js'
export { Discovery } from './discovery/index.js'

/**
 * MisakaNode - a single agent node in the Misaka Network
 */
export class MisakaNode {
  /**
   * @param {Object} config
   * @param {string} config.name - Agent display name
   * @param {string[]} config.skills - Agent skills (e.g., ['coding', 'translation'])
   * @param {number} config.httpPort - HTTP port for A2A server (default: 0 = random)
   * @param {number} config.p2pPort - libp2p TCP port (default: 0 = random)
   * @param {string[]} config.bootstrapPeers - Multiaddrs of bootstrap nodes
   * @param {Function} config.executor - Task executor: async (request) => responseText
   * @param {string} config.identityPath - Path to identity file (default: ~/.misaka/identity.json)
   * @param {string} config.host - HTTP host (default: '127.0.0.1')
   */
  constructor(config = {}) {
    this.config = {
      name: config.name || 'misaka-agent',
      skills: config.skills || [],
      httpPort: config.httpPort || 0,
      p2pPort: config.p2pPort || 0,
      bootstrapPeers: config.bootstrapPeers || [],
      executor: config.executor || defaultExecutor,
      identityPath: config.identityPath || undefined,
      host: config.host || '127.0.0.1'
    }

    this.identity = null
    this.network = null
    this.a2aServer = null
    this.discovery = null
    this.started = false

    // Resolved ports after start
    this.httpPort = null
    this.p2pPort = null
  }

  /**
   * Start the node: initialize identity, start P2P, start A2A server, begin discovery
   */
  async start() {
    console.log(`\n🌐 Starting Misaka Node: ${this.config.name}`)
    console.log('─'.repeat(50))

    // 1. Load or create identity
    this.identity = await Identity.loadOrCreate({
      name: this.config.name,
      skills: this.config.skills,
      filePath: this.config.identityPath
    })
    console.log(`✓ Identity: ${this.identity.did}`)

    // 2. Start P2P network
    this.network = new P2PNetwork()
    const nodeInfo = await this.network.start({
      port: this.config.p2pPort,
      bootstrapPeers: this.config.bootstrapPeers,
      enableMdns: this.config.enableMdns !== undefined ? this.config.enableMdns : false,
      enableDht: true,
      enablePubsub: true,
      identityPath: this.config.identityPath
    })
    console.log(`✓ P2P node: ${nodeInfo.peerId}`)
    console.log(`  Listening: ${nodeInfo.multiaddrs.join(', ') || '(waiting for addresses)'}`)

    // 3. Start A2A server
    const agentCard = createAgentCard({
      name: this.config.name,
      skills: this.config.skills,
      url: `http://${this.config.host}:${this.config.httpPort}`,
      description: `${this.config.name} on Misaka Network`
    })

    this.a2aServer = new A2AServer(agentCard, this.config.executor)
    this.a2aServer.createApp()

    // Add network info endpoint
    this.a2aServer.app.get('/network', (req, res) => {
      res.json(this.getStatus())
    })

    this.httpPort = await this.a2aServer.listen(this.config.httpPort)

    // Update agent card URL with resolved port
    const resolvedUrl = `http://${this.config.host}:${this.httpPort}`
    this.a2aServer.agentCard.url = `${resolvedUrl}/a2a`

    console.log(`✓ A2A server: ${resolvedUrl}`)
    console.log(`  Agent Card: ${resolvedUrl}/.well-known/agent-card.json`)

    // 4. Start discovery
    this.discovery = new Discovery(this.network, this.identity)

    this.discovery.on('peer:discovered', (peer) => {
      console.log(`  📡 Peer discovered: ${peer.name} (${peer.skills.join(', ')})`)
    })

    this.discovery.on('peer:offline', (peer) => {
      console.log(`  📴 Peer offline: ${peer.name}`)
    })

    await this.discovery.start(resolvedUrl)
    console.log(`✓ Discovery started`)

    // 5. Explicitly dial bootstrap peers (skip self)
    const myPeerId = this.network.getPeerId()
    const peersToConnect = this.config.bootstrapPeers.filter(addr => !addr.includes(myPeerId))
    if (peersToConnect.length > 0) {
      console.log(`  Connecting to ${peersToConnect.length} bootstrap node(s)...`)
      for (const addr of peersToConnect) {
        try {
          await this.network.dial(addr)
          console.log(`  ✓ Connected: ${addr.slice(0, 40)}...`)
        } catch (e) {
          console.log(`  ✗ Failed: ${addr.slice(0, 40)}... (${e.message.slice(0, 30)})`)
        }
      }
    }

    this.started = true
    console.log('─'.repeat(50))
    console.log(`🟢 Node online! ${this.discovery.peerCount} peers known\n`)

    return this.getStatus()
  }

  /**
   * Stop the node gracefully
   */
  async stop() {
    console.log(`\n🔴 Stopping node: ${this.config.name}`)

    if (this.discovery) {
      this.discovery.stop()
    }
    if (this.a2aServer) {
      await this.a2aServer.close()
    }
    if (this.network) {
      await this.network.stop()
    }

    this.started = false
    console.log('✓ Node stopped\n')
  }

  /**
   * Send a task to another agent by URL
   */
  async sendTask(agentUrl, text, opts = {}) {
    const client = new A2AClient(agentUrl)
    return client.sendMessage(text, opts)
  }

  /**
   * Send a task to a discovered peer by agent ID
   */
  async sendTaskToPeer(agentId, text, opts = {}) {
    const peer = this.discovery.getPeerByAgentId(agentId)
    if (!peer) throw new Error(`Peer not found: ${agentId}`)
    if (!peer.a2aUrl) throw new Error(`Peer has no A2A URL: ${agentId}`)

    return this.sendTask(peer.a2aUrl, text, opts)
  }

  /**
   * Find agents with a specific skill and send task to the first one
   */
  async delegateTask(skill, text, opts = {}) {
    const peers = this.discovery.findBySkill(skill)
    if (peers.length === 0) {
      throw new Error(`No agents found with skill: ${skill}`)
    }

    // Pick the first available peer (could be smarter: load balance, reputation, etc.)
    const peer = peers[0]
    console.log(`  → Delegating to ${peer.name} (${peer.a2aUrl})`)
    return this.sendTask(peer.a2aUrl, text, opts)
  }

  /**
   * Get current node status
   */
  getStatus() {
    return {
      name: this.config.name,
      agentId: this.identity?.agentId,
      did: this.identity?.did,
      skills: this.config.skills,
      started: this.started,
      http: {
        port: this.httpPort,
        url: `http://${this.config.host}:${this.httpPort}`
      },
      p2p: {
        peerId: this.network?.getPeerId(),
        multiaddrs: this.network?.getMultiaddrs() || [],
        connectedPeers: this.network?.getPeers() || []
      },
      geo: this.discovery?.geo || null,
      discovery: {
        knownPeers: this.discovery?.peerCount || 0,
        knownSkills: this.discovery?.getKnownSkills() || [],
        peers: this.discovery?.getOnlinePeers().map(p => ({
          name: p.name,
          agentId: p.agentId,
          skills: p.skills,
          a2aUrl: p.a2aUrl,
          geo: p.geo
        })) || []
      }
    }
  }

  /**
   * Get the A2A Express app (for custom route additions)
   */
  getApp() {
    return this.a2aServer?.app
  }
}

/**
 * Default task executor - echoes back a greeting
 */
async function defaultExecutor({ taskId, input }) {
  return `Hello from Misaka Network! You said: "${input}"`
}

export default MisakaNode
