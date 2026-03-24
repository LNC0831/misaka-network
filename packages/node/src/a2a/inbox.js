/**
 * Inbox — queue for incoming tasks from unknown agents
 *
 * Messages from unknown agents land here instead of being auto-executed.
 * The AI reviews them via MCP tools (check_inbox, accept_task, reject_task).
 *
 * Features:
 * - In-memory queue with optional disk persistence
 * - Auto-expire after 1 hour
 * - Event callbacks for new messages (used by MCP dynamic tool descriptions)
 */

import { randomUUID } from 'node:crypto'

const EXPIRE_MS = 60 * 60 * 1000  // 1 hour

export class Inbox {
  constructor() {
    this._messages = new Map()  // id -> InboxMessage
    this._onChangeCallbacks = []
    this._cleanupTimer = setInterval(() => this._cleanup(), 60000)
  }

  /**
   * Add a message to the inbox
   * @returns {string} message ID
   */
  add({ from, input, message, artifacts }) {
    const id = randomUUID()
    this._messages.set(id, {
      id,
      from: {
        did: from?.did || null,
        name: from?.name || 'Unknown',
        agentId: from?.agentId || null
      },
      type: 'task',
      input: input || '',
      message: message || null,
      artifacts: artifacts || [],
      receivedAt: new Date().toISOString(),
      status: 'pending'
    })
    this._notifyChange()
    return id
  }

  /**
   * Get a message by ID
   */
  get(id) {
    return this._messages.get(id) || null
  }

  /**
   * List all pending messages
   */
  listPending() {
    return [...this._messages.values()].filter(m => m.status === 'pending')
  }

  /**
   * List all messages (including handled)
   */
  listAll() {
    return [...this._messages.values()]
  }

  /**
   * Accept a message (mark for execution)
   * Returns the message data for the executor
   */
  accept(id) {
    const msg = this._messages.get(id)
    if (!msg) throw new Error(`Message not found: ${id}`)
    if (msg.status !== 'pending') throw new Error(`Message already ${msg.status}`)
    msg.status = 'accepted'
    msg.handledAt = new Date().toISOString()
    this._notifyChange()
    return msg
  }

  /**
   * Reject a message
   */
  reject(id, reason = '') {
    const msg = this._messages.get(id)
    if (!msg) throw new Error(`Message not found: ${id}`)
    if (msg.status !== 'pending') throw new Error(`Message already ${msg.status}`)
    msg.status = 'rejected'
    msg.rejectReason = reason
    msg.handledAt = new Date().toISOString()
    this._notifyChange()
    return msg
  }

  /**
   * Number of pending messages
   */
  get pendingCount() {
    return this.listPending().length
  }

  /**
   * Register a callback for inbox changes (new message, accept, reject)
   */
  onChange(callback) {
    this._onChangeCallbacks.push(callback)
  }

  /**
   * Clean up expired messages
   */
  _cleanup() {
    const now = Date.now()
    for (const [id, msg] of this._messages) {
      const age = now - new Date(msg.receivedAt).getTime()
      if (msg.status === 'pending' && age > EXPIRE_MS) {
        msg.status = 'expired'
        msg.handledAt = new Date().toISOString()
      }
      // Remove old handled messages (older than 2x expire time)
      if (msg.status !== 'pending' && age > EXPIRE_MS * 2) {
        this._messages.delete(id)
      }
    }
  }

  _notifyChange() {
    for (const cb of this._onChangeCallbacks) {
      try { cb(this.pendingCount) } catch {}
    }
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer)
      this._cleanupTimer = null
    }
  }
}
