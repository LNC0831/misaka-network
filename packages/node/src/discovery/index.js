/**
 * Discovery Module - publish/find Agent Cards via DHT and GossipSub
 *
 * Handles:
 * - Publishing agent card to DHT on join
 * - Announcing presence via GossipSub
 * - Finding agents by skill
 * - Maintaining local peer registry with heartbeat
 */

import { TOPICS, DHT_PREFIX } from '../network/index.js'

const HEARTBEAT_INTERVAL = 30000  // 30 seconds
const PEER_TIMEOUT = 90000        // 90 seconds without heartbeat = offline

/**
 * Fetch geolocation from IP using free API
 * Returns { lat, lng, city, country } or null
 */
async function fetchGeoIP() {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=lat,lon,city,country', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.lat && data.lon) {
      return { lat: data.lat, lng: data.lon, city: data.city || '', country: data.country || '' }
    }
  } catch {}
  return null
}

/**
 * PeerInfo - information about a known peer
 */
class PeerInfo {
  constructor(data) {
    this.agentId = data.agentId
    this.peerId = data.peerId
    this.did = data.did
    this.name = data.name
    this.skills = data.skills || []
    this.a2aUrl = data.a2aUrl
    this.multiaddrs = data.multiaddrs || []
    this.geo = data.geo || null   // { lat, lng, city, country }
    this.lastSeen = Date.now()
    this.joinedAt = data.joinedAt || Date.now()
  }

  isOnline() {
    return (Date.now() - this.lastSeen) < PEER_TIMEOUT
  }

  touch() {
    this.lastSeen = Date.now()
  }
}

/**
 * Discovery - agent discovery and registry
 */
export class Discovery {
  constructor(network, identity) {
    this.network = network
    this.identity = identity
    this.peers = new Map()       // peerId -> PeerInfo
    this.skillIndex = new Map()  // skill -> Set<peerId>
    this.geo = null              // { lat, lng, city, country }
    this._heartbeatTimer = null
    this._eventHandlers = new Map()
  }

  /**
   * Start discovery: publish self, subscribe to announcements, begin heartbeat
   */
  async start(a2aUrl) {
    this.a2aUrl = a2aUrl

    // Fetch geolocation (non-blocking)
    fetchGeoIP().then(geo => {
      if (geo) {
        this.geo = geo
        console.log(`  📍 Location: ${geo.city}, ${geo.country} (${geo.lat.toFixed(2)}, ${geo.lng.toFixed(2)})`)
      }
    })

    // Subscribe to announcement and heartbeat topics
    this.network.subscribe(TOPICS.AGENT_ANNOUNCE)
    this.network.subscribe(TOPICS.AGENT_HEARTBEAT)

    // Handle incoming pubsub messages
    this.network.on('pubsub:message', (msg) => {
      this._handlePubsubMessage(msg)
    })

    // Handle peer connect — re-announce after GossipSub mesh forms
    this.network.on('peer:connect', (peerId) => {
      this._emit('peer:connect', peerId.toString())
      // GossipSub needs ~1-2s after TCP connect to establish mesh (GRAFT/PRUNE exchange)
      // Then re-announce so the new peer learns about us
      setTimeout(() => this._announcePresence().catch(() => {}), 2000)
    })

    this.network.on('peer:disconnect', (peerId) => {
      const id = peerId.toString()
      if (this.peers.has(id)) {
        this._emit('peer:offline', this.peers.get(id))
      }
    })

    // Publish self to DHT (non-blocking, may fail with no peers)
    this._publishSelfToDht().catch(() => {})

    // Announce presence via GossipSub (non-blocking)
    this._announcePresence().catch(() => {})

    // Start heartbeat
    this._heartbeatTimer = setInterval(() => {
      this._sendHeartbeat()
      this._cleanupStalePeers()
    }, HEARTBEAT_INTERVAL)
  }

  /**
   * Stop discovery
   */
  stop() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  /**
   * Publish own agent card to DHT
   */
  async _publishSelfToDht() {
    const key = `${DHT_PREFIX.AGENT_CARD}${this.identity.agentId}`
    const card = this._buildAnnouncement()

    try {
      await this.network.dhtPut(key, card)
    } catch (err) {
      // DHT put may fail if not enough peers; that's okay during bootstrap
      console.warn('DHT publish deferred (not enough peers yet):', err.message)
    }
  }

  /**
   * Announce presence via GossipSub
   */
  async _announcePresence() {
    const announcement = this._buildAnnouncement()

    try {
      await this.network.publish(TOPICS.AGENT_ANNOUNCE, announcement)
    } catch (err) {
      // May fail if no subscribers yet
    }
  }

  /**
   * Build an announcement payload
   */
  _buildAnnouncement() {
    return {
      type: 'announce',
      agentId: this.identity.agentId,
      peerId: this.network.getPeerId(),
      did: this.identity.did,
      name: this.identity.name,
      skills: this.identity.skills,
      a2aUrl: this.a2aUrl,
      multiaddrs: this.network.getMultiaddrs(),
      geo: this.geo,
      timestamp: Date.now()
    }
  }

  /**
   * Send heartbeat — includes full announcement so late-joining peers can discover us
   */
  async _sendHeartbeat() {
    try {
      await this.network.publish(TOPICS.AGENT_HEARTBEAT, {
        ...this._buildAnnouncement(),
        type: 'heartbeat'
      })
    } catch {
      // Heartbeat failures are non-critical
    }
  }

  /**
   * Handle incoming pubsub message
   */
  _handlePubsubMessage(msg) {
    try {
      const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data

      if (msg.topic === TOPICS.AGENT_ANNOUNCE && data.type === 'announce') {
        this._handleAnnouncement(data)
      } else if (msg.topic === TOPICS.AGENT_HEARTBEAT && data.type === 'heartbeat') {
        this._handleHeartbeat(data)
      }
    } catch (err) {
      console.warn('Failed to parse pubsub message:', err.message)
    }
  }

  /**
   * Handle agent announcement
   */
  _handleAnnouncement(data) {
    // Don't register self
    if (data.agentId === this.identity.agentId) return

    const existing = this.peers.get(data.peerId)
    if (existing) {
      // Update existing peer
      existing.name = data.name
      existing.skills = data.skills
      existing.a2aUrl = data.a2aUrl
      existing.multiaddrs = data.multiaddrs
      existing.touch()
    } else {
      // New peer discovered
      const peer = new PeerInfo(data)
      this.peers.set(data.peerId, peer)

      // Update skill index
      for (const skill of data.skills || []) {
        if (!this.skillIndex.has(skill)) {
          this.skillIndex.set(skill, new Set())
        }
        this.skillIndex.get(skill).add(data.peerId)
      }

      this._emit('peer:discovered', peer)
    }
  }

  /**
   * Handle heartbeat — also registers unknown peers (acts as late announce)
   */
  _handleHeartbeat(data) {
    if (data.agentId === this.identity.agentId) return

    const peer = this.peers.get(data.peerId)
    if (peer) {
      peer.touch()
    } else if (data.agentId && data.name) {
      // Peer not yet known — register it (heartbeat carries full announcement data)
      this._handleAnnouncement(data)
    }
  }

  /**
   * Clean up peers that haven't sent heartbeat recently
   */
  _cleanupStalePeers() {
    for (const [peerId, peer] of this.peers) {
      if (!peer.isOnline()) {
        this.peers.delete(peerId)

        // Clean skill index
        for (const skill of peer.skills) {
          const set = this.skillIndex.get(skill)
          if (set) {
            set.delete(peerId)
            if (set.size === 0) this.skillIndex.delete(skill)
          }
        }

        this._emit('peer:offline', peer)
      }
    }
  }

  // === Query Methods ===

  /**
   * Find agents with a specific skill
   */
  findBySkill(skill) {
    const peerIds = this.skillIndex.get(skill)
    if (!peerIds) return []

    return [...peerIds]
      .map(id => this.peers.get(id))
      .filter(p => p && p.isOnline())
  }

  /**
   * Get all known online peers
   */
  getOnlinePeers() {
    return [...this.peers.values()].filter(p => p.isOnline())
  }

  /**
   * Get a peer by agent ID
   */
  getPeerByAgentId(agentId) {
    return [...this.peers.values()].find(p => p.agentId === agentId)
  }

  /**
   * Get all known skills in the network
   */
  getKnownSkills() {
    return [...this.skillIndex.keys()]
  }

  /**
   * Get peer count
   */
  get peerCount() {
    return this.getOnlinePeers().length
  }

  // === Event System ===

  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, [])
    }
    this._eventHandlers.get(event).push(handler)
  }

  _emit(event, data) {
    const handlers = this._eventHandlers.get(event) || []
    for (const handler of handlers) {
      try {
        handler(data)
      } catch (err) {
        console.error(`Error in discovery event handler for ${event}:`, err)
      }
    }
  }
}
