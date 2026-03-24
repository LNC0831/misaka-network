import React, { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import WorldMap from './components/WorldMap'
import NetworkStats from './components/NetworkStats'
import PeerList from './components/PeerList'
import ConnectionPanel from './components/ConnectionPanel'

/**
 * Misaka Network Dashboard
 *
 * Connects to one or more Misaka nodes and displays:
 * - Global agent node map
 * - Network statistics
 * - Live peer list
 */
export default function App() {
  const [nodeUrl, setNodeUrl] = useState('http://localhost:3300')
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [peers, setPeers] = useState([])
  const [refreshInterval, setRefreshInterval] = useState(null)

  const fetchStatus = useCallback(async (url) => {
    try {
      const res = await fetch(`${url}/network`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus(data)
      setConnected(true)
      setError(null)

      // Build peer list: self + discovered peers
      const allPeers = [
        {
          name: data.name,
          agentId: data.agentId,
          did: data.did,
          skills: data.skills,
          isSelf: true,
          a2aUrl: data.http?.url,
          geo: data.geo
        },
        ...(data.discovery?.peers || []).map(p => ({ ...p, isSelf: false }))
      ]
      setPeers(allPeers)
    } catch (err) {
      setError(err.message)
      setConnected(false)
      setStatus(null)
      setPeers([])
    }
  }, [])

  const connect = useCallback((url) => {
    setNodeUrl(url)
    fetchStatus(url)

    // Auto-refresh every 5 seconds
    if (refreshInterval) clearInterval(refreshInterval)
    const interval = setInterval(() => fetchStatus(url), 5000)
    setRefreshInterval(interval)
  }, [fetchStatus, refreshInterval])

  const disconnect = useCallback(() => {
    if (refreshInterval) clearInterval(refreshInterval)
    setRefreshInterval(null)
    setConnected(false)
    setStatus(null)
    setPeers([])
    setError(null)
  }, [refreshInterval])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
    }
  }, [refreshInterval])

  return (
    <div className="min-h-screen bg-gray-950">
      <Header connected={connected} nodeUrl={nodeUrl} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Connection Panel */}
        <ConnectionPanel
          nodeUrl={nodeUrl}
          connected={connected}
          error={error}
          onConnect={connect}
          onDisconnect={disconnect}
        />

        {/* Network Stats */}
        <NetworkStats status={status} peers={peers} />

        {/* World Map */}
        <WorldMap peers={peers} />

        {/* Peer List */}
        <PeerList peers={peers} />
      </main>

      <footer className="text-center text-gray-600 text-sm py-8">
        Misaka Network — Decentralized Agent Interconnection
      </footer>
    </div>
  )
}
