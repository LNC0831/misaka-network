/**
 * MisakaEventBus - user-friendly wrapper around the SDK's ExecutionEventBus
 *
 * Provides simple methods for reporting progress, sending artifacts, and
 * completing tasks. Used when the executor accepts a second parameter.
 */

import { randomUUID } from 'node:crypto'

export class MisakaEventBus {
  /**
   * @param {Object} sdkEventBus - The SDK's ExecutionEventBus
   * @param {string} taskId - Current task ID
   * @param {string} contextId - Current context ID
   * @param {Object} identity - Node's Identity (for artifact signing)
   */
  constructor(sdkEventBus, taskId, contextId, identity = null) {
    this._bus = sdkEventBus
    this._taskId = taskId
    this._contextId = contextId
    this._identity = identity
    this._taskCreated = false
  }

  /**
   * Ensure a Task object exists in the SDK's store.
   * Must be called before status-update or artifact-update events.
   */
  _ensureTask(userMessage) {
    if (this._taskCreated) return
    this._bus.publish({
      kind: 'task',
      id: this._taskId,
      contextId: this._contextId,
      status: { state: 'submitted', timestamp: new Date().toISOString() },
      history: userMessage ? [userMessage] : []
    })
    this._taskCreated = true
  }

  /**
   * Report status update
   * @param {string} state - 'working' | 'completed' | 'failed' | 'canceled' | 'input-required'
   * @param {string} [message] - Optional human-readable progress message
   */
  status(state, message) {
    const statusObj = {
      state,
      timestamp: new Date().toISOString()
    }
    if (message) {
      statusObj.message = {
        kind: 'message',
        messageId: randomUUID(),
        role: 'agent',
        parts: [{ kind: 'text', text: message }]
      }
    }

    this._bus.publish({
      kind: 'status-update',
      taskId: this._taskId,
      contextId: this._contextId,
      status: statusObj,
      final: state === 'completed' || state === 'failed' || state === 'canceled'
    })
  }

  /**
   * Report progress (shorthand for status('working', ...))
   * @param {number} percent - 0-100
   * @param {string} [message] - What's happening
   */
  progress(percent, message) {
    const text = message ? `${percent}%: ${message}` : `${percent}% complete`
    this.status('working', text)
  }

  /**
   * Send an artifact (file, data, or text)
   * @param {string} name - Artifact name (e.g. 'report.pdf', 'analysis.json')
   * @param {Array} parts - Array of part objects: { kind: 'text'|'file'|'data', ... }
   */
  async artifact(name, parts) {
    const normalizedParts = Array.isArray(parts) ? parts : [parts]

    const artifact = {
      artifactId: randomUUID(),
      name,
      parts: normalizedParts
    }

    // Sign the artifact with DID:key if identity is available
    if (this._identity) {
      try {
        const payload = JSON.stringify({ name: artifact.name, parts: artifact.parts })
        const signature = await this._identity.sign(payload)
        artifact.metadata = {
          signer: this._identity.did,
          signature: Buffer.from(signature).toString('base64url')
        }
      } catch {
        // Signing is best-effort; don't block on failure
      }
    }

    this._bus.publish({
      kind: 'artifact-update',
      taskId: this._taskId,
      contextId: this._contextId,
      artifact,
      append: false,
      lastChunk: true
    })
  }

  /**
   * Send a text artifact (convenience)
   */
  async text(name, content) {
    await this.artifact(name, [{ kind: 'text', text: content }])
  }

  /**
   * Send a file artifact (convenience)
   * @param {string} name - File name
   * @param {Buffer|Uint8Array|string} data - File content (Buffer/Uint8Array → base64, string → as-is)
   * @param {string} mimeType - MIME type
   */
  async file(name, data, mimeType = 'application/octet-stream') {
    const bytes = typeof data === 'string' ? data : Buffer.from(data).toString('base64')
    await this.artifact(name, [{ kind: 'file', file: { name, mimeType, bytes } }])
  }

  /**
   * Send a structured data artifact (convenience)
   * @param {string} name - Data name
   * @param {Object} data - JSON-serializable object
   */
  async data(name, data) {
    await this.artifact(name, [{ kind: 'data', data }])
  }

  /**
   * Mark task as completed
   * @param {string} [message] - Optional completion message
   */
  complete(message) {
    this.status('completed', message)
    this._bus.finished()
  }

  /**
   * Mark task as failed
   * @param {string} error - Error message
   */
  fail(error) {
    this.status('failed', error)
    this._bus.finished()
  }
}
