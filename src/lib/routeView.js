// Converte a saída de planRoutes (prévia) e as linhas de `routes` do banco no mesmo formato de tela.
// Cores com contraste ≥ 3:1 sobre o mapa claro; a lista sempre repete nome e número (cor nunca é a única pista).
export const ROUTE_COLORS = ['#0b5cad', '#b42318', '#116b3a', '#8a5300', '#6b3fa0', '#0e6b74']

// Embeds 1:1 do PostgREST podem vir como objeto ou array.
const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null
const sum = (list, k) => list.reduce((s, x) => s + Number(x[k]), 0)

const stopView = (d, order, eta) => ({
  id: d.id, order, eta, code: d.code, region: d.region, address: d.address, lat: d.lat, lng: d.lng,
  window_start: d.window_start, window_end: d.window_end, weight_kg: Number(d.weight_kg), status: d.status,
})

export function fromPlan(r, i) {
  return {
    key: r.vehicle.id, color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    name: `Rota ${i + 1} · ${r.vehicle.plate}`, plate: r.vehicle.plate, driver: r.vehicle.driver?.name,
    total_km: r.total_km, total_min: r.total_min, est_cost: r.est_cost,
    load_kg: r.load_kg, load_m3: r.load_m3, cap_kg: Number(r.vehicle.capacity_kg), cap_m3: Number(r.vehicle.capacity_m3),
    geometry: r.geometry, stops: r.stops.map((s) => stopView(s.delivery, s.order, s.eta)),
  }
}

export function fromDb(row, i) {
  const v = one(row.vehicles) ?? {}
  const ds = [...(row.deliveries ?? [])].sort((a, b) => a.stop_order - b.stop_order)
  return {
    key: row.id, id: row.id, status: row.status, color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    name: row.name, plate: v.plate, driver: one(row.drivers)?.name,
    total_km: Number(row.total_km), total_min: row.total_min, est_cost: Number(row.est_cost),
    load_kg: Number(row.load_kg), load_m3: Math.round(sum(ds, 'volume_m3') * 1000) / 1000,
    cap_kg: Number(v.capacity_kg), cap_m3: Number(v.capacity_m3),
    geometry: row.geometry ?? [], stops: ds.map((d) => stopView(d, d.stop_order, d.eta)),
  }
}

// select() de rotas com veículo, motorista e paradas — usado em /roteirizacao e /motorista.
export const ROUTE_SELECT = 'id, name, status, route_date, total_km, total_min, est_cost, load_kg, geometry, '
  + 'vehicles(plate, capacity_kg, capacity_m3), drivers(name), '
  + 'deliveries(id, code, region, address, lat, lng, window_start, window_end, weight_kg, volume_m3, status, stop_order, eta)'
