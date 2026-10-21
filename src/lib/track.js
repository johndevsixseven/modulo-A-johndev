import { haversineKm } from './routing.js'

// Pontos igualmente espaçados (por distância) ao longo da geometria [[lat,lng], ...] da rota.
// Usado pelo modo simulação: cada ponto vira uma posição enviada a cada 3 s.
export function trackPoints(geometry, steps) {
  if (!geometry?.length) return []
  if (geometry.length === 1 || steps < 2) return [geometry[0]]
  const p = (g) => ({ lat: g[0], lng: g[1] })
  const seg = geometry.slice(1).map((g, i) => haversineKm(p(geometry[i]), p(g)))
  const total = seg.reduce((s, d) => s + d, 0)
  const out = []
  let i = 0, acc = 0
  for (let k = 0; k < steps; k++) {
    const target = (total * k) / (steps - 1)
    while (i < seg.length - 1 && acc + seg[i] < target) acc += seg[i++]
    const t = seg[i] ? Math.min(1, Math.max(0, (target - acc) / seg[i])) : 0
    const [a, b] = [geometry[i], geometry[i + 1]]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

// Cores por status das paradas no painel (a legenda repete em texto).
export const STATUS_COLORS = {
  pendente: '#6b7280', planejada: '#6b7280', a_caminho: '#2563eb',
  entregue: '#2f855a', falha: '#b42318', cancelada: '#6b7280',
}
