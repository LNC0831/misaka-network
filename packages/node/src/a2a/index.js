/**
 * A2A Integration Module
 *
 * Uses @a2a-js/sdk@0.3.13 for protocol-compliant A2A server and client:
 * - A2A server via SDK Express middleware (JSON-RPC + REST + Agent Card)
 * - A2A client via SDK ClientFactory
 * - Agent Card generation from node config
 *
 * The SDK handles JSON-RPC parsing, task lifecycle, and protocol compliance.
 * We wrap the user's simple executor function in the SDK's AgentExecutor interface.
 */

import express from 'express'
import { randomUUID } from 'node:crypto'

// --- SDK imports ---
// Core types (AgentCard shape, AGENT_CARD_PATH constant)
import { AGENT_CARD_PATH } from '@a2a-js/sdk'

// Server: executor interface, request handler, in-memory stores
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server'

// Express middleware: serves agent card, JSON-RPC endpoint, REST endpoint
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express'

// Client: factory that auto-discovers agent card and creates typed client
import { ClientFactory } from '@a2a-js/sdk/client'

/**
 * Create an A2A-compatible Agent Card
 *
 * Returns a plain object conforming to the A2A v0.3 AgentCard schema.
 * The SDK middleware will serve this at /.well-known/agent.json
 */
export function createAgentCard({ name, description, skills, url, version = '1.0.0' }) {
  return {
    name,
    description: description || `${name} - a Misaka Network agent`,
    protocolVersion: '0.3.0',
    version,
    url: `${url}/a2a`,
    skills: (skills || []).map(skill => ({
      id: typeof skill === 'string' ? skill : skill.id,
      name: typeof skill === 'string' ? skill : skill.name,
      description: typeof skill === 'string' ? `Skill: ${skill}` : (skill.description || skill.name),
      tags: typeof skill === 'string' ? [skill] : (skill.tags || [])
    })),
    capabilities: {
      streaming: false,
      pushNotifications: false
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    provider: {
      organization: 'Misaka Network',
      url: 'https://github.com/LNC0831/misaka-network'
    }
  }
}

/**
 * MisakaAgentExecutor - wraps a simple `async ({taskId, input, message}) => string`
 * function in the SDK's AgentExecutor interface.
 *
 * The SDK's AgentExecutor expects:
 *   execute(requestContext, eventBus): Promise<void>
 *   cancelTask(taskId, eventBus): Promise<void>
 *
 * requestContext has: taskId, contextId, userMessage (the Message object), task
 * eventBus has: publish(event), finished()
 *
 * We extract text from the user message, call the simple executor,
 * then publish a completed task with the response as an artifact.
 */
class MisakaAgentExecutor {
  /**
   * @param {Function} simpleFn - async ({taskId, input, message, metadata}) => string
   */
  constructor(simpleFn) {
    this._fn = simpleFn
  }

  async execute(requestContext, eventBus) {
    const { taskId, contextId, userMessage } = requestContext

    // Extract text from message parts
    const inputText = (userMessage.parts || [])
      .filter(p => p.kind === 'text')
      .map(p => p.text)
      .join('\n')

    try {
      // Call the user's simple executor
      const responseText = await this._fn({
        taskId,
        input: inputText,
        message: userMessage,
        metadata: userMessage.metadata
      })

      // Publish a Message response (simplest SDK pattern, proven to work)
      eventBus.publish({
        kind: 'message',
        messageId: randomUUID(),
        role: 'agent',
        parts: [{ kind: 'text', text: responseText }],
        contextId
      })
    } catch (err) {
      eventBus.publish({
        kind: 'message',
        messageId: randomUUID(),
        role: 'agent',
        parts: [{ kind: 'text', text: `Error: ${err.message}` }],
        contextId
      })
    }

    eventBus.finished()
  }

  async cancelTask(taskId, eventBus) {
    eventBus.publish({
      kind: 'status-update',
      taskId,
      status: { state: 'canceled', timestamp: new Date().toISOString() },
      final: true
    })
    eventBus.finished()
  }
}

/**
 * A2AServer - handles incoming A2A requests via Express + @a2a-js/sdk middleware
 *
 * Backward-compatible API: constructor(agentCard, executor), createApp(), listen(port), close()
 */
export class A2AServer {
  /**
   * @param {Object} agentCard - Agent card object from createAgentCard()
   * @param {Function} executor - async ({taskId, input, message, metadata}) => string
   */
  constructor(agentCard, executor) {
    this.agentCard = agentCard
    this.executor = executor
    this.app = null
    this.server = null

    // SDK components
    this._taskStore = new InMemoryTaskStore()
    this._agentExecutor = new MisakaAgentExecutor(executor)
    this._requestHandler = new DefaultRequestHandler(
      agentCard,
      this._taskStore,
      this._agentExecutor
    )
  }

  /**
   * Create and configure the Express app with SDK middleware
   */
  createApp() {
    const app = express()
    app.use(express.json())

    // CORS - allow dashboard and other frontends to connect
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      if (req.method === 'OPTIONS') return res.sendStatus(204)
      next()
    })

    // --- SDK middleware ---

    // Agent Card at well-known path (SDK uses AGENT_CARD_PATH = ".well-known/agent.json")
    app.use(
      `/${AGENT_CARD_PATH}`,
      agentCardHandler({ agentCardProvider: this._requestHandler })
    )

    // Also serve at the /agent-card.json path for compatibility
    app.get('/.well-known/agent-card.json', (req, res) => {
      res.json(this.agentCard)
    })

    // JSON-RPC endpoint (primary A2A protocol transport)
    app.use(
      '/a2a',
      jsonRpcHandler({
        requestHandler: this._requestHandler,
        userBuilder: UserBuilder.noAuthentication
      })
    )

    // REST endpoint (alternative transport)
    app.use(
      '/a2a/rest',
      restHandler({
        requestHandler: this._requestHandler,
        userBuilder: UserBuilder.noAuthentication
      })
    )

    // --- Custom endpoints (preserved from original) ---

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', agent: this.agentCard.name })
    })

    this.app = app
    return app
  }

  /**
   * Start listening on a port
   * @param {number} port - Port number (0 for random)
   * @returns {Promise<number>} Resolved port number
   */
  async listen(port) {
    if (!this.app) this.createApp()

    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        const resolvedPort = this.server.address().port
        resolve(resolvedPort)
      })
    })
  }

  /**
   * Stop the server
   */
  async close() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve)
      })
    }
  }
}

/**
 * A2AClient - sends tasks to other A2A agents via @a2a-js/sdk ClientFactory
 *
 * Backward-compatible API: constructor(agentUrl), getAgentCard(), sendMessage(text, opts), getTask(taskId)
 *
 * Internally uses the SDK's ClientFactory which handles:
 * - Auto-discovery of agent card from /.well-known/agent.json
 * - Proper JSON-RPC message formatting
 * - Protocol version negotiation
 */
export class A2AClient {
  /**
   * @param {string} agentUrl - Base URL of the remote agent (e.g., http://localhost:4000)
   */
  constructor(agentUrl) {
    this.agentUrl = agentUrl.replace(/\/$/, '')
    this._factory = new ClientFactory()
    this._client = null // lazily initialized
  }

  /**
   * Get or create the SDK client (lazy init with agent card discovery)
   */
  async _getClient() {
    if (!this._client) {
      this._client = await this._factory.createFromUrl(this.agentUrl)
    }
    return this._client
  }

  /**
   * Fetch the agent card from the remote agent
   */
  async getAgentCard() {
    const res = await fetch(`${this.agentUrl}/.well-known/agent-card.json`)
    if (!res.ok) {
      // Fallback to SDK standard path
      const res2 = await fetch(`${this.agentUrl}/.well-known/agent.json`)
      if (!res2.ok) throw new Error(`Failed to fetch agent card: ${res.status}`)
      return res2.json()
    }
    return res.json()
  }

  /**
   * Send a text message/task to the agent
   *
   * @param {string} text - Message text
   * @param {Object} opts - Options: { contextId, metadata }
   * @returns {Promise<Object>} Response message or task object from the SDK
   */
  async sendMessage(text, opts = {}) {
    const client = await this._getClient()

    const params = {
      message: {
        messageId: randomUUID(),
        role: 'user',
        parts: [{ kind: 'text', text }],
        kind: 'message',
        ...(opts.contextId ? { contextId: opts.contextId } : {})
      },
      ...(opts.metadata ? { metadata: opts.metadata } : {})
    }

    const response = await client.sendMessage(params)

    // Backward compatibility: callers expect a Message-like object with .parts[].text
    // The SDK may return a Task (with .artifacts, .history) or a Message.
    // We normalize to always return a Message-shaped object.
    return this._extractMessage(response)
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId) {
    const client = await this._getClient()
    return client.getTask({ id: taskId })
  }

  /**
   * Extract a backward-compatible Message object from an SDK response.
   *
   * The old custom implementation returned the JSON-RPC result directly,
   * which was a Message with { kind, messageId, role, parts, contextId }.
   * Callers access result.parts[].text to get the response text.
   *
   * The SDK client.sendMessage() returns a Task object:
   *   { kind: 'task', id, status, artifacts: [{parts: [...]}], history: [Message...] }
   *
   * We extract the agent's response from either:
   *   1. The last agent message in history (if present)
   *   2. The first artifact's parts (if present)
   *   3. Fall back to returning the raw response
   */
  _extractMessage(response) {
    if (!response) return response

    // If it already looks like a Message (has .parts directly), return as-is
    if (response.parts) return response

    // If it's a Task object from the SDK
    if (response.kind === 'task') {
      // Try history first: find the last agent message
      if (response.history && response.history.length > 0) {
        const agentMessages = response.history.filter(m => m.role === 'agent')
        if (agentMessages.length > 0) {
          return agentMessages[agentMessages.length - 1]
        }
      }

      // Try artifacts: build a synthetic Message from artifact parts
      if (response.artifacts && response.artifacts.length > 0) {
        const allParts = response.artifacts.flatMap(a => a.parts || [])
        if (allParts.length > 0) {
          return {
            kind: 'message',
            messageId: response.id || randomUUID(),
            role: 'agent',
            parts: allParts,
            contextId: response.contextId
          }
        }
      }
    }

    // Fallback: return raw response
    return response
  }
}
