import React from 'react'

function StatCard({ label, value, icon, color = 'misaka' }) {
  const colorClasses = {
    misaka: 'from-misaka-600/20 to-misaka-800/10 border-misaka-700/30 text-misaka-400',
    green: 'from-green-600/20 to-green-800/10 border-green-700/30 text-green-400',
    purple: 'from-purple-600/20 to-purple-800/10 border-purple-700/30 text-purple-400',
    amber: 'from-amber-600/20 to-amber-800/10 border-amber-700/30 text-amber-400',
  }

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}

export default function NetworkStats({ status, peers }) {
  if (!status) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Nodes Online" value="—" icon="🌐" />
        <StatCard label="Known Skills" value="—" icon="⚡" color="purple" />
        <StatCard label="P2P Peers" value="—" icon="🔗" color="green" />
        <StatCard label="DID Method" value="—" icon="🔑" color="amber" />
      </div>
    )
  }

  const onlineCount = peers.length
  const skillCount = status.discovery?.knownSkills?.length || status.skills?.length || 0
  const p2pPeers = status.p2p?.connectedPeers?.length || 0
  const didMethod = status.did?.startsWith('did:key:') ? 'key' : 'web'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Nodes Visible" value={onlineCount} icon="🌐" />
      <StatCard label="Known Skills" value={skillCount} icon="⚡" color="purple" />
      <StatCard label="P2P Connections" value={p2pPeers} icon="🔗" color="green" />
      <StatCard label="DID Method" value={didMethod} icon="🔑" color="amber" />
    </div>
  )
}
