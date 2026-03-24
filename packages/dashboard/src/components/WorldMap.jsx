import React, { useMemo, useRef, useEffect, useState } from 'react'

/**
 * WorldMap - 3D Globe showing agent nodes and connections
 *
 * Uses react-globe.gl for a dark-themed 3D earth with:
 * - Glowing points for each agent node
 * - Animated arcs for connections between nodes
 * - Labels on hover
 *
 * Since we don't have real geolocation yet, nodes are placed using
 * a deterministic hash of their agentId to generate lat/lng.
 * Known locations (like Singapore seed) are hardcoded.
 */

// Known locations for named nodes
const KNOWN_LOCATIONS = {
  'Last-Order': { lat: 1.3521, lng: 103.8198 },       // Singapore
  'misaka-seed-sg': { lat: 1.3521, lng: 103.8198 },   // Singapore
}

// Deterministic lat/lng from string hash (for unknown locations)
function hashToLatLng(str) {
  let h1 = 0, h2 = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = ((h1 << 5) - h1 + ch) | 0
    h2 = ((h2 << 7) - h2 + ch * 31) | 0
  }
  const lat = -60 + (Math.abs(h1) % 12000) / 100  // -60 to +60
  const lng = -180 + (Math.abs(h2) % 36000) / 100 // -180 to +180
  return { lat, lng }
}

function getNodePosition(peer) {
  // Priority: real GeoIP data → known locations → hash fallback
  if (peer.geo?.lat && peer.geo?.lng) return { lat: peer.geo.lat, lng: peer.geo.lng }
  if (KNOWN_LOCATIONS[peer.name]) return KNOWN_LOCATIONS[peer.name]
  return hashToLatLng(peer.agentId || peer.name || 'unknown')
}

export default function WorldMap({ peers }) {
  const globeRef = useRef()
  const containerRef = useRef()
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [GlobeComponent, setGlobeComponent] = useState(null)

  // Dynamic import (react-globe.gl uses browser APIs)
  useEffect(() => {
    import('react-globe.gl').then(mod => {
      setGlobeComponent(() => mod.default)
    })
  }, [])

  // Responsive sizing
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      setDimensions({ width, height: Math.min(width * 0.6, 600) })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Auto-rotate
  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls()
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.5
    }
  }, [GlobeComponent])

  // Build points data
  const points = useMemo(() => {
    return peers.map(peer => {
      const pos = getNodePosition(peer)
      const geo = peer.geo
      const location = geo ? `${geo.city}${geo.city && geo.country ? ', ' : ''}${geo.country}` : ''
      return {
        ...pos,
        name: peer.name || peer.agentId?.slice(0, 12),
        color: peer.isSelf ? '#22c55e' : '#36a9f8',
        altitude: peer.isSelf ? 0.08 : 0.04,
        radius: peer.isSelf ? 0.7 : 0.4,
        skills: peer.skills || [],
        location,
        isSelf: peer.isSelf
      }
    })
  }, [peers])

  // Build arcs (connect every non-self node to self node)
  const arcs = useMemo(() => {
    const selfNode = points.find(p => p.isSelf)
    if (!selfNode) return []
    return points
      .filter(p => !p.isSelf)
      .map(p => ({
        startLat: selfNode.lat,
        startLng: selfNode.lng,
        endLat: p.lat,
        endLng: p.lng,
        color: ['#22c55e40', '#36a9f840']
      }))
  }, [points])

  // Rings (pulse effect on self node)
  const rings = useMemo(() => {
    const selfNode = points.find(p => p.isSelf)
    if (!selfNode) return []
    return [{ lat: selfNode.lat, lng: selfNode.lng, maxR: 3, propagationSpeed: 2, repeatPeriod: 1500 }]
  }, [points])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden" ref={containerRef}>
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">Global Agent Network</h2>
        <span className="text-xs text-gray-600">
          {peers.length} node{peers.length !== 1 ? 's' : ''} visible
        </span>
      </div>

      <div className="flex items-center justify-center" style={{ height: dimensions.height }}>
        {!GlobeComponent ? (
          <div className="text-gray-600 text-sm">Loading globe...</div>
        ) : peers.length === 0 ? (
          <div className="text-gray-600 text-sm">Connect to a node to see the network</div>
        ) : (
          <GlobeComponent
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            showAtmosphere={true}
            atmosphereColor="#1e40af"
            atmosphereAltitude={0.2}
            animateIn={true}

            // Points (agent nodes)
            pointsData={points}
            pointLat="lat"
            pointLng="lng"
            pointColor="color"
            pointAltitude="altitude"
            pointRadius="radius"
            pointResolution={12}
            pointLabel={d => `
              <div style="background:#1e293b;padding:8px 12px;border-radius:8px;border:1px solid #334155;font-size:12px;color:#e2e8f0;">
                <b style="color:${d.color}">${d.name}</b>${d.isSelf ? ' <span style="color:#22c55e;font-size:10px">(YOU)</span>' : ''}
                ${d.location ? '<br/><span style="color:#64748b">📍 ' + d.location + '</span>' : ''}
                ${d.skills.length > 0 ? '<br/><span style="color:#94a3b8">' + d.skills.join(', ') + '</span>' : ''}
              </div>
            `}

            // Arcs (connections)
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor="color"
            arcDashLength={0.4}
            arcDashGap={0.2}
            arcDashAnimateTime={2000}
            arcStroke={0.5}

            // Rings (pulse on self)
            ringsData={rings}
            ringLat="lat"
            ringLng="lng"
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
            ringColor={() => '#22c55e40'}
          />
        )}
      </div>
    </div>
  )
}
