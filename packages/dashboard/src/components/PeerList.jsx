import React from 'react'

function PeerCard({ peer }) {
  const isSelf = peer.isSelf
  const didShort = peer.did
    ? peer.did.length > 40
      ? peer.did.slice(0, 20) + '...' + peer.did.slice(-12)
      : peer.did
    : '—'

  return (
    <div className={`bg-gray-800/50 rounded-lg p-4 border ${isSelf ? 'border-green-700/30' : 'border-gray-700/30'} hover:border-gray-600/50 transition-colors`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-green-500 node-pulse' : 'bg-misaka-500'}`} />
          <span className="font-medium text-white text-sm">
            {peer.name || 'Unknown Agent'}
          </span>
          {isSelf && (
            <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">
              YOU
            </span>
          )}
        </div>
      </div>

      {/* DID */}
      <div className="mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">DID</span>
        <p className="text-xs text-gray-400 font-mono break-all">{didShort}</p>
      </div>

      {/* Skills */}
      {peer.skills && peer.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {peer.skills.map(skill => (
            <span
              key={skill}
              className="text-[10px] bg-misaka-900/40 text-misaka-300 px-2 py-0.5 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* A2A URL */}
      {peer.a2aUrl && (
        <div className="mt-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">A2A</span>
          <p className="text-xs text-gray-500 font-mono">{peer.a2aUrl}</p>
        </div>
      )}
    </div>
  )
}

export default function PeerList({ peers }) {
  if (peers.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <p className="text-gray-500 text-sm">No agents connected</p>
        <p className="text-gray-600 text-xs mt-1">Start a Misaka node and connect to see agents here</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">Agent Nodes</h2>
        <span className="text-xs text-gray-600">
          {peers.length} total
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {peers.map((peer, i) => (
          <PeerCard key={peer.agentId || i} peer={peer} />
        ))}
      </div>
    </div>
  )
}
