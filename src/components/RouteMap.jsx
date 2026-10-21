import { useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { env } from '../lib/env.js'

const TILE_ERRORS_TO_FALLBACK = 3 // PLANO 9.1: ≥ 3 tileerror → só a lista

// Mapa das rotas (Leaflet + OSM). Carregado sob demanda (lazy). Se os tiles falharem ou
// VITE_ENABLE_MAPS=false, mostra um aviso: a lista de paradas ao lado continua com tudo.
export default function RouteMap({ routes, depot }) {
  const [errors, setErrors] = useState(0)
  const points = routes.flatMap((r) => r.geometry)
  if (depot) points.push([depot.lat, depot.lng])

  if (!env.enableMaps || errors >= TILE_ERRORS_TO_FALLBACK) {
    return (
      <p className="notice" role="status">
        {env.enableMaps ? 'O mapa não carregou.' : 'Mapa desligado nesta instalação.'} As rotas estão completas na lista de paradas.
      </p>
    )
  }
  if (!points.length) return null

  return (
    <div className="route-map" role="region" aria-label="Mapa das rotas. As mesmas paradas estão na lista a seguir.">
      {/* key remonta o mapa para reenquadrar quando as rotas mudam */}
      <MapContainer key={routes.map((r) => r.key).join()} bounds={points} boundsOptions={{ padding: [24, 24] }}
        scrollWheelZoom={false} style={{ height: '100%' }}>
        <TileLayer url={env.mapTileUrl} attribution="&copy; colaboradores do OpenStreetMap"
          eventHandlers={{ tileerror: () => setErrors((n) => n + 1) }} />
        {depot && (
          <CircleMarker center={[depot.lat, depot.lng]} radius={9} pathOptions={{ color: '#1a1f2b', fillOpacity: 1 }}>
            <Tooltip>Depósito</Tooltip>
          </CircleMarker>
        )}
        {routes.map((r) => (
          <Polyline key={r.key} positions={r.geometry} pathOptions={{ color: r.color, weight: 4 }}>
            <Tooltip sticky>{r.name}</Tooltip>
          </Polyline>
        ))}
        {routes.flatMap((r) => r.stops.map((s) => (
          <CircleMarker key={`${r.key}-${s.id}`} center={[s.lat, s.lng]} radius={7}
            pathOptions={{ color: r.color, fillColor: '#fff', fillOpacity: 1, weight: 3 }}>
            <Tooltip>{r.name} · parada {s.order}: {s.code}</Tooltip>
          </CircleMarker>
        )))}
      </MapContainer>
    </div>
  )
}
