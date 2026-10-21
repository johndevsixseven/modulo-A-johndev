// Geocodificação via Nominatim (OSM). Política de uso: no máximo 1 requisição/s, sem lotes paralelos.
// No navegador não dá para trocar o User-Agent; o Referer da aplicação identifica a origem.
import { env } from './env.js'

export const geocodeEnabled = env.enableMaps

let next = 0 // próximo horário livre (fila global: chamadas simultâneas esperam a vez)

/** Retorna {lat, lng}, null se o endereço não foi encontrado, ou lança erro se o serviço falhar. */
export async function geocode(address) {
  if (!geocodeEnabled) throw new Error('Geocodificação desligada')
  const at = Math.max(Date.now(), next)
  next = at + 1100
  await new Promise((r) => setTimeout(r, at - Date.now()))
  const params = new URLSearchParams({
    q: address, format: 'jsonv2', limit: '1', countrycodes: 'br', 'accept-language': 'pt-BR',
  })
  const res = await fetch(`${env.nominatimUrl}/search?${params}`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`)
  const [hit] = await res.json()
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
}
