/**
 * Identity Module - DID:key (default) + DID:web (optional) + Ed25519
 *
 * Generates and manages agent identity:
 * - Ed25519 keypair for signing
 * - DID:key identifier (default, pure P2P, no domain needed)
 * - DID:web identifier (optional, for agents with a domain)
 * - DID Document generation (W3C compliant)
 * - Persistent storage to ~/.misaka/identity.json
 *
 * DID:key is derived purely from the public key — it's self-certifying,
 * needs no server, no domain, no blockchain. Any agent can verify your
 * identity by just having your DID. This is the right default for a
 * decentralized P2P network.
 *
 * DID:web is supported for agents that have a domain and want to be
 * discoverable via HTTPS (e.g., did:web:myagent.com).
 */

import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Required for @noble/ed25519 v2.x
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

const MISAKA_DIR = join(homedir(), '.misaka')
const IDENTITY_FILE = join(MISAKA_DIR, 'identity.json')

// Multicodec prefix for Ed25519 public key (0xed01)
const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01])

// DID method types
export const DID_METHOD = {
  KEY: 'key',   // Default: pure public key, self-certifying
  WEB: 'web'    // Optional: domain-based, needs HTTPS server
}

/**
 * Convert Uint8Array to base64url string
 */
export function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

/**
 * Convert base64url string to Uint8Array
 */
export function fromBase64Url(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'))
}

/**
 * Encode bytes as multibase base58btc (prefix 'z')
 */
function toMultibaseBase58btc(bytes) {
  // Base58btc alphabet (Bitcoin style)
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'))
  let encoded = ''
  while (num > 0n) {
    const remainder = num % 58n
    num = num / 58n
    encoded = ALPHABET[Number(remainder)] + encoded
  }
  // Handle leading zeros
  for (const byte of bytes) {
    if (byte === 0) encoded = '1' + encoded
    else break
  }
  return 'z' + encoded  // 'z' = multibase prefix for base58btc
}

/**
 * Decode multibase base58btc string (prefix 'z') to bytes
 */
function fromMultibaseBase58btc(str) {
  if (!str.startsWith('z')) throw new Error('Not a multibase base58btc string')
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const input = str.slice(1) // remove 'z' prefix
  let num = 0n
  for (const char of input) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`)
    num = num * 58n + BigInt(idx)
  }
  const hex = num.toString(16).padStart(2, '0')
  const bytes = new Uint8Array(Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex'))
  // Handle leading zeros (encoded as '1' in base58)
  let leadingZeros = 0
  for (const char of input) {
    if (char === '1') leadingZeros++
    else break
  }
  if (leadingZeros > 0) {
    const result = new Uint8Array(leadingZeros + bytes.length)
    result.set(bytes, leadingZeros)
    return result
  }
  return bytes
}

/**
 * Generate a new Ed25519 keypair
 */
export async function generateKeypair() {
  const privateKey = ed.utils.randomPrivateKey()
  const publicKey = await ed.getPublicKeyAsync(privateKey)
  return { privateKey, publicKey }
}

/**
 * Sign a message with the private key
 */
export async function sign(message, privateKey) {
  const msgBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message
  return await ed.signAsync(msgBytes, privateKey)
}

/**
 * Verify a signature
 */
export async function verify(message, signature, publicKey) {
  const msgBytes = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message
  return await ed.verifyAsync(signature, msgBytes, publicKey)
}

/**
 * Generate a short agent ID from public key
 */
function agentIdFromPublicKey(publicKey) {
  const hash = Buffer.from(publicKey).toString('hex').slice(0, 16)
  return `agent-${hash}`
}

// === DID:key ===

/**
 * Create a DID:key from a public key
 * Format: did:key:z<base58btc(multicodec-prefix + raw-public-key)>
 * Self-certifying: the DID *is* the public key. No server needed.
 */
function createDidKey(publicKey) {
  const prefixed = new Uint8Array(ED25519_MULTICODEC.length + publicKey.length)
  prefixed.set(ED25519_MULTICODEC)
  prefixed.set(publicKey, ED25519_MULTICODEC.length)
  return `did:key:${toMultibaseBase58btc(prefixed)}`
}

/**
 * Extract the public key from a DID:key
 */
function publicKeyFromDidKey(didKey) {
  if (!didKey.startsWith('did:key:z')) {
    throw new Error('Invalid did:key format')
  }
  const multibaseStr = didKey.slice('did:key:'.length)
  const decoded = fromMultibaseBase58btc(multibaseStr)
  // Strip the 2-byte multicodec prefix (0xed01)
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Not an Ed25519 did:key (wrong multicodec prefix)')
  }
  return decoded.slice(2)
}

/**
 * Create a DID Document for a DID:key
 */
function createDidKeyDocument(did, publicKey) {
  const keyId = `${did}#${did.slice('did:key:'.length)}`
  const multibase = toMultibaseBase58btc(
    new Uint8Array([...ED25519_MULTICODEC, ...publicKey])
  )
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: did,
    verificationMethod: [{
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: multibase
    }],
    authentication: [keyId],
    assertionMethod: [keyId],
    capabilityInvocation: [keyId],
    capabilityDelegation: [keyId]
  }
}

// === DID:web ===

/**
 * Create a DID:web from a domain
 * For agents with a real domain that serves /.well-known/did.json
 */
function createDidWeb(agentId, domain) {
  return `did:web:${domain}:agents:${agentId}`
}

/**
 * Create a DID Document for a DID:web
 */
function createDidWebDocument(did, publicKey) {
  const publicKeyBase64Url = toBase64Url(publicKey)
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: did,
    verificationMethod: [{
      id: `${did}#key-1`,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: `u${publicKeyBase64Url}`
    }],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`]
  }
}

// === Unified DID helpers ===

/**
 * Detect DID method from a DID string
 */
function detectDidMethod(did) {
  if (did.startsWith('did:key:')) return DID_METHOD.KEY
  if (did.startsWith('did:web:')) return DID_METHOD.WEB
  throw new Error(`Unknown DID method: ${did}`)
}

/**
 * Create a DID based on method
 */
function createDid(publicKey, { method = DID_METHOD.KEY, domain = null, agentId = null } = {}) {
  switch (method) {
    case DID_METHOD.KEY:
      return createDidKey(publicKey)
    case DID_METHOD.WEB:
      if (!domain) throw new Error('DID:web requires a domain')
      return createDidWeb(agentId || agentIdFromPublicKey(publicKey), domain)
    default:
      throw new Error(`Unsupported DID method: ${method}`)
  }
}

/**
 * Create a DID Document based on method
 */
function createDidDocument(did, publicKey) {
  const method = detectDidMethod(did)
  switch (method) {
    case DID_METHOD.KEY:
      return createDidKeyDocument(did, publicKey)
    case DID_METHOD.WEB:
      return createDidWebDocument(did, publicKey)
    default:
      throw new Error(`Unsupported DID method: ${did}`)
  }
}

/**
 * Identity - manages a single agent's identity
 */
export class Identity {
  constructor({ agentId, did, didMethod, publicKey, privateKey, name, skills, domain, createdAt }) {
    this.agentId = agentId
    this.did = did
    this.didMethod = didMethod || detectDidMethod(did)
    this.publicKey = publicKey
    this.privateKey = privateKey
    this.name = name || agentId
    this.skills = skills || []
    this.domain = domain || null
    this.createdAt = createdAt || new Date().toISOString()
  }

  /**
   * Create a new identity
   * @param {Object} opts
   * @param {string} opts.name - Display name
   * @param {string[]} opts.skills - Agent skills
   * @param {string} opts.didMethod - 'key' (default) or 'web'
   * @param {string} opts.domain - Required for DID:web
   */
  static async create({ name, skills = [], didMethod = DID_METHOD.KEY, domain = null } = {}) {
    const { privateKey, publicKey } = await generateKeypair()
    const agentId = agentIdFromPublicKey(publicKey)
    const did = createDid(publicKey, { method: didMethod, domain, agentId })

    return new Identity({
      agentId,
      did,
      didMethod,
      publicKey,
      privateKey,
      name: name || agentId,
      skills,
      domain
    })
  }

  /**
   * Load identity from disk, or create new one if not found
   */
  static async loadOrCreate(opts = {}) {
    const filePath = opts.filePath || IDENTITY_FILE

    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(await readFile(filePath, 'utf-8'))

        // Migration: old identity files may have DID:web with misaka.local
        // Upgrade them to DID:key
        let did = data.did
        let didMethod = data.didMethod
        const publicKey = fromBase64Url(data.publicKey)

        if (!didMethod) {
          didMethod = detectDidMethod(did)
        }
        if (did.includes('misaka.local')) {
          // Migrate old placeholder DID:web to proper DID:key
          did = createDidKey(publicKey)
          didMethod = DID_METHOD.KEY
        }

        return new Identity({
          agentId: data.agentId,
          did,
          didMethod,
          publicKey,
          privateKey: fromBase64Url(data.privateKey),
          name: data.name,
          skills: data.skills,
          domain: data.domain,
          createdAt: data.createdAt
        })
      } catch (err) {
        console.warn('Failed to load identity, creating new one:', err.message)
      }
    }

    const identity = await Identity.create(opts)
    await identity.save(filePath)
    return identity
  }

  /**
   * Save identity to disk
   */
  async save(filePath = IDENTITY_FILE) {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const data = {
      agentId: this.agentId,
      did: this.did,
      didMethod: this.didMethod,
      publicKey: toBase64Url(this.publicKey),
      privateKey: toBase64Url(this.privateKey),
      name: this.name,
      skills: this.skills,
      domain: this.domain,
      createdAt: this.createdAt
    }

    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /**
   * Get the DID document for this identity
   */
  getDidDocument() {
    return createDidDocument(this.did, this.publicKey)
  }

  /**
   * Sign a message
   */
  async sign(message) {
    return sign(message, this.privateKey)
  }

  /**
   * Verify a signature against this identity's public key
   */
  async verify(message, signature) {
    return verify(message, signature, this.publicKey)
  }

  /**
   * Get public key as base64url string
   */
  getPublicKeyBase64Url() {
    return toBase64Url(this.publicKey)
  }

  /**
   * Verify a signature from a remote DID:key
   * Static method — you don't need the private key to verify
   */
  static async verifyFromDid(did, message, signature) {
    if (!did.startsWith('did:key:')) {
      throw new Error('Remote verification only supported for did:key')
    }
    const publicKey = publicKeyFromDidKey(did)
    return verify(message, signature, publicKey)
  }

  /**
   * Serialize for network transmission (no private key!)
   */
  toPublic() {
    return {
      agentId: this.agentId,
      did: this.did,
      didMethod: this.didMethod,
      publicKey: toBase64Url(this.publicKey),
      name: this.name,
      skills: this.skills,
      createdAt: this.createdAt
    }
  }

  toString() {
    return `Identity(${this.name} | ${this.did})`
  }
}

export { publicKeyFromDidKey }
