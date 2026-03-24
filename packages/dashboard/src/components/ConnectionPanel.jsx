import React, { useState } from 'react'

export default function ConnectionPanel({ nodeUrl, connected, error, onConnect, onDisconnect }) {
  const [inputUrl, setInputUrl] = useState(nodeUrl)

  const handleConnect = (e) => {
    e.preventDefault()
    onConnect(inputUrl)
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <form onSubmit={handleConnect} className="flex items-center gap-3">
        <label className="text-sm text-gray-400 whitespace-nowrap">Node URL:</label>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="http://localhost:3200"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-misaka-500 transition-colors"
          disabled={connected}
        />
        {connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="submit"
            className="px-4 py-2 bg-misaka-600 hover:bg-misaka-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Connect
          </button>
        )}
      </form>

      {error && (
        <div className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
          Connection failed: {error}
        </div>
      )}
    </div>
  )
}
