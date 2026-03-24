/**
 * TrustList — manages trust levels for known agents
 *
 * Three levels:
 *   blocked  — reject all requests
 *   unknown  — route to inbox for AI review
 *   trusted  — auto-execute via executor
 *
 * Persisted to ~/.misaka/trust-list.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const TRUST_LEVEL = {
  BLOCKED: 'blocked',
  UNKNOWN: 'unknown',
  TRUSTED: 'trusted'
}

const DEFAULT_PATH = join(homedir(), '.misaka', 'trust-list.json')

export class TrustList {
  constructor(filePath = DEFAULT_PATH) {
    this._filePath = filePath
    this._agents = new Map()  // did -> { did, name, trust, firstSeen, lastInteraction, taskCount, note }
  }

  async load() {
    if (!existsSync(this._filePath)) return
    try {
      const data = JSON.parse(await readFile(this._filePath, 'utf-8'))
      for (const agent of Object.values(data.agents || {})) {
        this._agents.set(agent.did, agent)
      }
    } catch {
      // Corrupted file, start fresh
    }
  }

  async save() {
    const dir = dirname(this._filePath)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    const data = { agents: Object.fromEntries(this._agents) }
    await writeFile(this._filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /**
   * Get trust level for a DID. Returns UNKNOWN if not in list.
   */
  getTrust(did) {
    if (!did) return TRUST_LEVEL.UNKNOWN
    const agent = this._agents.get(did)
    return agent?.trust || TRUST_LEVEL.UNKNOWN
  }

  /**
   * Set trust level for a DID
   */
  async setTrust(did, level, meta = {}) {
    const existing = this._agents.get(did) || {}
    this._agents.set(did, {
      did,
      name: meta.name || existing.name || 'Unknown',
      trust: level,
      firstSeen: existing.firstSeen || new Date().toISOString(),
      lastInteraction: new Date().toISOString(),
      taskCount: existing.taskCount || 0,
      note: meta.note !== undefined ? meta.note : (existing.note || '')
    })
    await this.save()
  }

  /**
   * Record an interaction (increments task count, updates lastInteraction)
   */
  async recordInteraction(did, name) {
    const existing = this._agents.get(did)
    if (existing) {
      existing.lastInteraction = new Date().toISOString()
      existing.taskCount = (existing.taskCount || 0) + 1
      if (name) existing.name = name
      await this.save()
    }
  }

  /**
   * Remove an agent from the list (resets to UNKNOWN)
   */
  async remove(did) {
    this._agents.delete(did)
    await this.save()
  }

  /**
   * List all agents with their trust levels
   */
  list() {
    return [...this._agents.values()]
  }

  /**
   * List agents by trust level
   */
  listByTrust(level) {
    return this.list().filter(a => a.trust === level)
  }
}
