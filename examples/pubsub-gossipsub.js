#!/usr/bin/env node

/**
 * WORKING GossipSub PubSub Example - Two js-libp2p v3 Nodes
 *
 * Demonstrates two libp2p nodes exchanging messages via GossipSub.
 *
 * KEY LESSONS LEARNED (from debugging libp2p v3 + gossipsub):
 *
 * 1. You MUST wait for subscription propagation before publishing.
 *    GossipSub subscription announcements travel asynchronously.
 *    If you publish immediately after subscribe(), the remote peer
 *    won't have you in its mesh yet, and the message is lost silently.
 *
 * 2. GossipSub forms a mesh on heartbeat intervals (~1s by default).
 *    After subscriptions propagate, you still need to wait for at least
 *    one heartbeat cycle for the mesh to form.
 *
 * 3. The `identify` service is REQUIRED. Without it, peers cannot
 *    negotiate the gossipsub protocol after connecting.
 *
 * 4. `emitSelf: false` (default) means a node does NOT receive its own
 *    published messages. Set `emitSelf: true` if you need that.
 *
 * 5. `allowPublishToZeroTopicPeers: true` prevents publish() from
 *    throwing when there are no peers subscribed to the topic yet.
 *
 * CRITICAL VERSION NOTE:
 *   libp2p v3.x is BROKEN with @chainsafe/libp2p-gossipsub@14.x due to
 *   @multiformats/multiaddr v13 removing .tuples() method that gossipsub
 *   depends on. See: https://github.com/ChainSafe/js-libp2p-gossipsub/issues/537
 *
 *   Additionally, libp2p v3 changed the stream API (it-pipe), causing
 *   "fns.shift(...) is not a function" errors in gossipsub's OutboundStream.
 *
 *   USE libp2p v2.x UNTIL gossipsub is updated for v3.
 *
 * Tested with (WORKING):
 *   libp2p@2.10.0
 *   @chainsafe/libp2p-gossipsub@14.1.2
 *   @chainsafe/libp2p-noise@16.1.5
 *   @chainsafe/libp2p-yamux@7.0.4
 *   @libp2p/tcp@10.1.19
 *   @libp2p/identify@3.0.39
 *
 * Usage:
 *   cd network/packages/node && npm install
 *   node ../../examples/pubsub-gossipsub.js
 */

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'

// ── Helpers ────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Poll until nodeA sees that nodeB has subscribed to `topic`.
 * This is the CRITICAL step most examples miss.
 */
async function waitForSubscription(nodeA, nodeB, topic, timeoutMs = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const subscribers = nodeA.services.pubsub.getSubscribers(topic)
    const peerIds = subscribers.map((p) => p.toString())
    if (peerIds.includes(nodeB.peerId.toString())) {
      return
    }
    await sleep(100)
  }
  throw new Error(
    `Timeout: ${nodeA.peerId} never saw ${nodeB.peerId} subscribe to "${topic}"`
  )
}

// ── Create a libp2p node with GossipSub ────────────────────

async function createNode(name) {
  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/0']   // random port on localhost
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      // identify is REQUIRED - without it, gossipsub protocol negotiation fails
      identify: identify(),

      pubsub: gossipsub({
        emitSelf: false,                      // don't receive own messages
        allowPublishToZeroTopicPeers: true,   // don't throw if no peers yet
        // Reduce heartbeat interval for faster mesh formation in demos
        heartbeatInterval: 500                // default is 1000ms
      })
    }
  })

  console.log(`[${name}] Started - PeerId: ${node.peerId}`)
  console.log(`[${name}] Listening: ${node.getMultiaddrs().map(String).join(', ')}`)

  return node
}

// ── Main ───────────────────────────────────────────────────

const TOPIC = 'misaka/demo'

console.log('================================================================')
console.log('  GossipSub PubSub Example - Two Nodes Exchanging Messages')
console.log('================================================================\n')

// Step 1: Create two nodes
console.log('--- Step 1: Creating two libp2p nodes with GossipSub ---\n')
const node1 = await createNode('Node1')
const node2 = await createNode('Node2')

// Step 2: Connect them
console.log('\n--- Step 2: Connecting Node1 -> Node2 ---\n')
await node1.dial(node2.getMultiaddrs())
console.log('Connected! Peers:')
console.log(`  Node1 peers: ${node1.getPeers().map(String)}`)
console.log(`  Node2 peers: ${node2.getPeers().map(String)}`)

// Step 3: Both subscribe to the topic
console.log('\n--- Step 3: Both nodes subscribe to topic ---\n')
const received1 = []
const received2 = []

node1.services.pubsub.addEventListener('message', (evt) => {
  if (evt.detail.topic === TOPIC) {
    const text = new TextDecoder().decode(evt.detail.data)
    received1.push(text)
    console.log(`  [Node1 RECEIVED] "${text}" from ${evt.detail.from}`)
  }
})
node1.services.pubsub.subscribe(TOPIC)
console.log('  Node1 subscribed to:', TOPIC)

node2.services.pubsub.addEventListener('message', (evt) => {
  if (evt.detail.topic === TOPIC) {
    const text = new TextDecoder().decode(evt.detail.data)
    received2.push(text)
    console.log(`  [Node2 RECEIVED] "${text}" from ${evt.detail.from}`)
  }
})
node2.services.pubsub.subscribe(TOPIC)
console.log('  Node2 subscribed to:', TOPIC)

// Step 4: CRITICAL - Wait for subscription propagation
console.log('\n--- Step 4: Waiting for subscription propagation ---\n')
console.log('  (This is the step most tutorials skip, causing silent message loss)')
await waitForSubscription(node1, node2, TOPIC)
console.log('  Node1 sees Node2 subscribed.')
await waitForSubscription(node2, node1, TOPIC)
console.log('  Node2 sees Node1 subscribed.')

// Step 5: Wait one more heartbeat for mesh formation
console.log('\n  Waiting for GossipSub mesh formation (~1 heartbeat cycle)...')
await sleep(1000)

// Step 6: Exchange messages
console.log('\n--- Step 5: Publishing messages ---\n')

// Node1 publishes
const msg1 = 'Hello from Node1! The mesh is working.'
await node1.services.pubsub.publish(TOPIC, new TextEncoder().encode(msg1))
console.log(`  [Node1 PUBLISHED] "${msg1}"`)

// Small delay between publishes
await sleep(200)

// Node2 publishes
const msg2 = 'Hello from Node2! GossipSub is great.'
await node2.services.pubsub.publish(TOPIC, new TextEncoder().encode(msg2))
console.log(`  [Node2 PUBLISHED] "${msg2}"`)

// Wait for message delivery
await sleep(1000)

// Step 7: Verify
console.log('\n--- Step 6: Results ---\n')
console.log(`  Node1 received ${received1.length} message(s): ${JSON.stringify(received1)}`)
console.log(`  Node2 received ${received2.length} message(s): ${JSON.stringify(received2)}`)

const success = received1.length >= 1 && received2.length >= 1
if (success) {
  console.log('\n  SUCCESS: Both nodes received messages via GossipSub!\n')
} else {
  console.log('\n  FAILED: Messages were not delivered. Debug info:')
  console.log(`    Node1 subscribers: ${node1.services.pubsub.getSubscribers(TOPIC).map(String)}`)
  console.log(`    Node2 subscribers: ${node2.services.pubsub.getSubscribers(TOPIC).map(String)}`)
  console.log(`    Node1 topics: ${node1.services.pubsub.getTopics()}`)
  console.log(`    Node2 topics: ${node2.services.pubsub.getTopics()}\n`)
}

// Cleanup
await node1.stop()
await node2.stop()
console.log('Both nodes stopped. Done.')
process.exit(success ? 0 : 1)
