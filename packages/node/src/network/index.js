/**
 * Network Module - libp2p node with DHT + GossipSub
 *
 * Provides the P2P networking layer:
 * - TCP transport with noise encryption
 * - Kademlia DHT for distributed key-value storage
 * - GossipSub for pub/sub messaging
 * - mDNS for local peer discovery
 */

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { kadDHT } from '@libp2p/kad-dht'
import { multiaddr } from '@multiformats/multiaddr'
import { gossipsub } from '@libp2p/gossipsub'
import { mdns } from '@libp2p/mdns'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { bootstrap } from '@libp2p/bootstrap'
import { generateKeyPair, privateKeyFromRaw } from '@libp2p/crypto/keys'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// GossipSub topics
export const TOPICS = {
  AGENT_ANNOUNCE: 'misaka/agent-announcements',
  AGENT_TASKS: 'misaka/agent-tasks',
  AGENT_HEARTBEAT: 'misaka/agent-heartbeat'
}

// DHT key prefixes
export const DHT_PREFIX = {
  AGENT_CARD: '/misaka/agent/',
  SKILL_INDEX: '/misaka/skill/'
}

/**
 * P2PNetwork - manages the libp2p node
 */
export class P2PNetwork {
  constructor() {
    this.node = null
    this.started = false
    this._eventHandlers = new Map()
  }

  /**
   * Initialize and start the libp2p node
   */
  async start(config = {}) {
    const {
      port = 0,        // 0 = random available port
      bootstrapPeers = [],
      enableMdns = false,
      enableDht = true,
      enablePubsub = true,
      identityPath = null  // path to persist libp2p private key
    } = config

    // Load or generate persistent libp2p private key
    let privateKey = null
    if (identityPath) {
      const p2pKeyPath = identityPath.replace(/\.json$/, '-p2p-key.bin')
      if (existsSync(p2pKeyPath)) {
        const raw = await readFile(p2pKeyPath)
        privateKey = privateKeyFromRaw(raw)
      } else {
        privateKey = await generateKeyPair('Ed25519')
        const dir = join(p2pKeyPath, '..')
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        await writeFile(p2pKeyPath, privateKey.raw)
      }
    }

    const peerDiscovery = []
    if (enableMdns) {
      try {
        peerDiscovery.push(mdns({ interval: 10000 }))
      } catch (err) {
        console.warn('mDNS not available:', err.message)
      }
    }
    if (bootstrapPeers.length > 0) {
      peerDiscovery.push(bootstrap({ list: bootstrapPeers }))
    }

    const services = {
      identify: identify(),
      ping: ping()
    }

    if (enableDht) {
      services.dht = kadDHT({
        clientMode: false,
        protocol: '/misaka/kad/1.0.0'
      })
    }

    if (enablePubsub) {
      services.pubsub = gossipsub({
        emitSelf: false,
        allowPublishToZeroTopicPeers: true  // useful during bootstrap
      })
    }

    this.node = await createLibp2p({
      ...(privateKey ? { privateKey } : {}),
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}`]
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery,
      services
    })

    // Wire up events
    this.node.addEventListener('peer:discovery', (evt) => {
      this._emit('peer:discovery', evt.detail)
    })

    this.node.addEventListener('peer:connect', (evt) => {
      this._emit('peer:connect', evt.detail)
    })

    this.node.addEventListener('peer:disconnect', (evt) => {
      this._emit('peer:disconnect', evt.detail)
    })

    // Subscribe to pubsub messages
    if (enablePubsub && this.node.services.pubsub) {
      this.node.services.pubsub.addEventListener('message', (evt) => {
        this._emit('pubsub:message', {
          topic: evt.detail.topic,
          data: new TextDecoder().decode(evt.detail.data),
          from: evt.detail.from?.toString()
        })
      })
    }

    await this.node.start()
    this.started = true

    return this.getNodeInfo()
  }

  /**
   * Stop the libp2p node
   */
  async stop() {
    if (this.node) {
      await this.node.stop()
      this.started = false
    }
  }

  /**
   * Get node info (multiaddrs, peerId)
   */
  getNodeInfo() {
    if (!this.node) return null
    return {
      peerId: this.node.peerId.toString(),
      multiaddrs: this.node.getMultiaddrs().map(a => a.toString()),
      peers: this.node.getPeers().map(p => p.toString())
    }
  }

  /**
   * Get the peer ID string
   */
  getPeerId() {
    return this.node?.peerId?.toString()
  }

  /**
   * Get multiaddrs as strings
   */
  getMultiaddrs() {
    return this.node?.getMultiaddrs().map(a => a.toString()) || []
  }

  /**
   * Get connected peers
   */
  getPeers() {
    return this.node?.getPeers().map(p => p.toString()) || []
  }

  /**
   * Dial a peer by multiaddr string or object
   */
  async dial(addr) {
    if (!this.node) throw new Error('Node not started')
    const ma = typeof addr === 'string' ? multiaddr(addr) : addr
    return this.node.dial(ma)
  }

  // === DHT Operations ===

  /**
   * Store a value in the DHT (with timeout)
   */
  async dhtPut(key, value, timeoutMs = 5000) {
    if (!this.node?.services?.dht) throw new Error('DHT not enabled')

    const keyBytes = new TextEncoder().encode(key)
    const valueBytes = typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new TextEncoder().encode(JSON.stringify(value))

    await Promise.race([
      (async () => {
        for await (const event of this.node.services.dht.put(keyBytes, valueBytes)) {
          // Consume the async iterable to complete the operation
        }
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DHT put timeout')), timeoutMs))
    ])
  }

  /**
   * Retrieve a value from the DHT (with timeout)
   */
  async dhtGet(key, timeoutMs = 5000) {
    if (!this.node?.services?.dht) throw new Error('DHT not enabled')

    const keyBytes = new TextEncoder().encode(key)

    return Promise.race([
      (async () => {
        for await (const event of this.node.services.dht.get(keyBytes)) {
          if (event.name === 'VALUE') {
            const raw = new TextDecoder().decode(event.value)
            try {
              return JSON.parse(raw)
            } catch {
              return raw
            }
          }
        }
        return null
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DHT get timeout')), timeoutMs))
    ])
  }

  // === PubSub Operations ===

  /**
   * Subscribe to a topic
   */
  subscribe(topic) {
    if (!this.node?.services?.pubsub) throw new Error('PubSub not enabled')
    this.node.services.pubsub.subscribe(topic)
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic) {
    if (!this.node?.services?.pubsub) throw new Error('PubSub not enabled')
    this.node.services.pubsub.unsubscribe(topic)
  }

  /**
   * Publish a message to a topic
   */
  async publish(topic, data) {
    if (!this.node?.services?.pubsub) throw new Error('PubSub not enabled')

    const msgBytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new TextEncoder().encode(JSON.stringify(data))

    await this.node.services.pubsub.publish(topic, msgBytes)
  }

  // === Event System ===

  /**
   * Register an event handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, [])
    }
    this._eventHandlers.get(event).push(handler)
  }

  /**
   * Remove an event handler
   */
  off(event, handler) {
    const handlers = this._eventHandlers.get(event)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx !== -1) handlers.splice(idx, 1)
    }
  }

  /**
   * Emit an event
   */
  _emit(event, data) {
    const handlers = this._eventHandlers.get(event) || []
    for (const handler of handlers) {
      try {
        handler(data)
      } catch (err) {
        console.error(`Error in event handler for ${event}:`, err)
      }
    }
  }
}
