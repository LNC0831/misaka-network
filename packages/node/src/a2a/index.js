/**
 * A2A Integration Module
 *
 * Wraps A2A protocol for agent-to-agent task communication:
 * - A2A server (Express-based) for receiving tasks
 * - A2A client for sending tasks to other agents
 * - Agent Card generation from node config
 *
 * NOTE: @a2a-js/sdk is ESM-only. If the SDK is not available,
 * we fall back to a lightweight built-in implementation that
 * follows the A2A v0.3 spec (JSON-RPC over HTTP).
 */

import express from 'express'
import { randomUUID } from 'node:crypto'

/**
 * Create an A2A-compatible Agent Card
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
      url: 'https://github.com/AgentMarket'
    }
  }
}

/**
 * A2AServer - handles incoming A2A requests via Express
 */
export class A2AServer {
  constructor(agentCard, executor) {
    this.agentCard = agentCard
    this.executor = executor  // async function(message) => response
    this.tasks = new Map()
    this.app = null
    this.server = null
  }

  /**
   * Create and configure the Express app
   */
  createApp() {
    const app = express()
    app.use(express.json())

    // CORS - allow dashboard and other frontends to connect
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.header('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') return res.sendStatus(204)
      next()
    })

    // Serve Agent Card at well-known path
    app.get('/.well-known/agent-card.json', (req, res) => {
      res.json(this.agentCard)
    })

    // Also serve at the legacy path
    app.get('/.well-known/agent.json', (req, res) => {
      res.json(this.agentCard)
    })

    // A2A JSON-RPC endpoint
    app.post('/a2a', async (req, res) => {
      try {
        const { jsonrpc, id, method, params } = req.body

        if (jsonrpc !== '2.0') {
          return res.json({
            jsonrpc: '2.0', id,
            error: { code: -32600, message: 'Invalid JSON-RPC version' }
          })
        }

        let result
        switch (method) {
          case 'message/send':
            result = await this._handleMessageSend(params)
            break
          case 'tasks/get':
            result = this._handleTaskGet(params)
            break
          case 'tasks/cancel':
            result = this._handleTaskCancel(params)
            break
          default:
            return res.json({
              jsonrpc: '2.0', id,
              error: { code: -32601, message: `Method not found: ${method}` }
            })
        }

        res.json({ jsonrpc: '2.0', id, result })
      } catch (err) {
        console.error('A2A request error:', err)
        res.json({
          jsonrpc: '2.0',
          id: req.body?.id,
          error: { code: -32603, message: err.message }
        })
      }
    })

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', agent: this.agentCard.name })
    })

    this.app = app
    return app
  }

  /**
   * Handle message/send - execute a task
   */
  async _handleMessageSend(params) {
    const { message } = params
    const taskId = randomUUID()

    // Extract text from message parts
    const inputText = (message.parts || [])
      .filter(p => p.kind === 'text')
      .map(p => p.text)
      .join('\n')

    // Create task record
    const task = {
      kind: 'task',
      id: taskId,
      contextId: message.contextId || randomUUID(),
      status: { state: 'working', timestamp: new Date().toISOString() },
      history: [message],
      artifacts: []
    }
    this.tasks.set(taskId, task)

    // Execute via the provided executor function
    try {
      const responseText = await this.executor({
        taskId,
        input: inputText,
        message,
        metadata: params.metadata
      })

      // Build response message
      const responseMessage = {
        kind: 'message',
        messageId: randomUUID(),
        role: 'agent',
        parts: [{ kind: 'text', text: responseText }],
        contextId: task.contextId
      }

      // Update task to completed
      task.status = { state: 'completed', timestamp: new Date().toISOString() }
      task.history.push(responseMessage)

      return responseMessage
    } catch (err) {
      task.status = { state: 'failed', timestamp: new Date().toISOString() }
      throw err
    }
  }

  /**
   * Handle tasks/get
   */
  _handleTaskGet(params) {
    const task = this.tasks.get(params.id)
    if (!task) {
      throw Object.assign(new Error('Task not found'), { code: -32001 })
    }
    return task
  }

  /**
   * Handle tasks/cancel
   */
  _handleTaskCancel(params) {
    const task = this.tasks.get(params.id)
    if (!task) {
      throw Object.assign(new Error('Task not found'), { code: -32001 })
    }
    task.status = { state: 'canceled', timestamp: new Date().toISOString() }
    return task
  }

  /**
   * Start listening on a port
   */
  async listen(port) {
    if (!this.app) this.createApp()

    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        resolve(port)
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
 * A2AClient - sends tasks to other A2A agents
 */
export class A2AClient {
  constructor(agentUrl) {
    // agentUrl should be the base URL (e.g., http://localhost:4000)
    this.agentUrl = agentUrl.replace(/\/$/, '')
  }

  /**
   * Fetch the agent card from the remote agent
   */
  async getAgentCard() {
    const res = await fetch(`${this.agentUrl}/.well-known/agent-card.json`)
    if (!res.ok) throw new Error(`Failed to fetch agent card: ${res.status}`)
    return res.json()
  }

  /**
   * Send a text message/task to the agent
   */
  async sendMessage(text, opts = {}) {
    const message = {
      kind: 'message',
      messageId: randomUUID(),
      role: 'user',
      parts: [{ kind: 'text', text }],
      contextId: opts.contextId || randomUUID()
    }

    const body = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'message/send',
      params: {
        message,
        ...(opts.metadata ? { metadata: opts.metadata } : {})
      }
    }

    const res = await fetch(`${this.agentUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) throw new Error(`A2A request failed: ${res.status}`)

    const json = await res.json()
    if (json.error) throw new Error(`A2A error: ${json.error.message}`)

    return json.result
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId) {
    const body = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tasks/get',
      params: { id: taskId }
    }

    const res = await fetch(`${this.agentUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const json = await res.json()
    if (json.error) throw new Error(`A2A error: ${json.error.message}`)
    return json.result
  }
}
