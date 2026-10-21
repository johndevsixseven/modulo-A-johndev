import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversineKm, planRoutes } from './routing.js'

const depot = { lat: -23.5505, lng: -46.6333 }
const H = 36e5
const start = Date.parse('2026-10-21T11:00:00Z') // 08:00 em Brasília

// 30 pedidos determinísticos espalhados em ~±0,1° do depósito, como o seed.
function orders(n = 30) {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i}`, code: `PED-${i}`,
    lat: depot.lat + (((i * 37) % 21) - 10) / 100, lng: depot.lng + (((i * 53) % 21) - 10) / 100,
    weight_kg: i % 7 === 0 ? 1.5 : 2 + ((i * 37) % 23), volume_m3: 0.01 + ((i * 13) % 19) / 100,
    window_start: new Date(start + (i % 6) * H).toISOString(),
    window_end: new Date(start + ((i % 6) + 3 + (i % 2)) * H).toISOString(),
    priority: i === 3 ? 'urgente' : i % 9 === 0 ? 'alta' : 'normal',
  }))
}
const fleet = [
  { id: 'moto', capacity_kg: 30, capacity_m3: 0.15, range_km: 150, cost_per_km: 0.6 },
  { id: 'van', capacity_kg: 1200, capacity_m3: 8, range_km: 400, cost_per_km: 1.8 },
  { id: 'util', capacity_kg: 650, capacity_m3: 3.5, range_km: 350, cost_per_km: 1.2 },
]

function checkRoutes(routes) {
  for (const r of routes) {
    const kg = r.stops.reduce((s, x) => s + Number(x.delivery.weight_kg), 0)
    const m3 = r.stops.reduce((s, x) => s + Number(x.delivery.volume_m3), 0)
    assert.ok(kg <= r.vehicle.capacity_kg + 1e-9, `kg excedido em ${r.vehicle.id}`)
    assert.ok(m3 <= r.vehicle.capacity_m3 + 1e-9, `m³ excedido em ${r.vehicle.id}`)
    assert.ok(r.total_km <= r.vehicle.range_km, `autonomia excedida em ${r.vehicle.id}`)
    for (const s of r.stops) {
      const eta = Date.parse(s.eta)
      assert.ok(eta >= Date.parse(s.delivery.window_start) && eta <= Date.parse(s.delivery.window_end),
        `janela violada em ${s.delivery.code}`)
    }
    assert.deepEqual(r.stops.map((s) => s.order), r.stops.map((_, i) => i + 1))
    assert.equal(r.geometry.length, r.stops.length + 2)
    assert.ok(Math.abs(r.est_cost - r.total_km * r.vehicle.cost_per_km) <= 0.02)
  }
}

test('haversine: 1° de latitude ≈ 111 km', () => {
  assert.ok(Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.19) < 0.1)
})

test('30 pedidos: capacidade, janelas e autonomia respeitadas; cada pedido aparece uma vez', () => {
  const list = orders()
  const { routes, unassigned } = planRoutes({ deliveries: list, vehicles: fleet, depot, start })
  checkRoutes(routes)
  const ids = [...routes.flatMap((r) => r.stops.map((s) => s.delivery.id)), ...unassigned.map((u) => u.delivery.id)]
  assert.equal(ids.length, list.length)
  assert.equal(new Set(ids).size, list.length)
  assert.ok(routes.length >= 2)
})

test('janela impossível vira não alocado com motivo', () => {
  const late = { ...orders(1)[0], id: 'late', window_start: new Date(start - 4 * H).toISOString(),
    window_end: new Date(start - H / 2).toISOString() }
  const { routes, unassigned } = planRoutes({ deliveries: [late], vehicles: fleet, depot, start })
  assert.equal(routes.length, 0)
  assert.deepEqual(unassigned.map((u) => [u.delivery.id, u.reason]), [['late', 'janela']])
})

test('espera o início da janela quando chega antes', () => {
  const d = { ...orders(1)[0], window_start: new Date(start + 2 * H).toISOString(), window_end: new Date(start + 3 * H).toISOString() }
  const { routes } = planRoutes({ deliveries: [d], vehicles: fleet, depot, start })
  assert.equal(routes[0].stops[0].eta, d.window_start)
})

test('autonomia e capacidade', () => {
  const far = { ...orders(1)[0], id: 'far', lat: depot.lat + 2 } // ~290 km de rua só a ida
  const heavy = { ...orders(1)[0], id: 'heavy', weight_kg: 5000 }
  const { routes, unassigned } = planRoutes({ deliveries: [far, heavy], vehicles: [fleet[0], fleet[2]], depot, start })
  assert.equal(routes.length, 0)
  assert.deepEqual(Object.fromEntries(unassigned.map((u) => [u.delivery.id, u.reason])), { far: 'autonomia', heavy: 'capacidade' })

  const { routes: r2 } = planRoutes({ deliveries: orders(), vehicles: [{ ...fleet[1], range_km: 40 }], depot, start })
  checkRoutes(r2)
})

test('frota cheia: sobra marcada como "frota" (ou "capacidade")', () => {
  const { routes, unassigned } = planRoutes({ deliveries: orders(), vehicles: [fleet[0]], depot, start })
  checkRoutes(routes)
  assert.ok(unassigned.length > 0)
  assert.ok(unassigned.some((u) => u.reason === 'frota'))
  // volume > 0,15 m³ não cabe na moto em nenhuma hipótese
  assert.ok(unassigned.every((u) => u.reason === 'frota' || Number(u.delivery.volume_m3) > 0.15))
})

test('2-opt nunca piora a distância', () => {
  for (const n of [5, 12, 30]) {
    const base = { deliveries: orders(n), vehicles: fleet, depot, start }
    const km = (res) => res.routes.reduce((s, r) => s + r.total_km, 0)
    const a = planRoutes({ ...base, twoOpt: false })
    const b = planRoutes(base)
    assert.ok(km(b) <= km(a) + 1e-9, `n=${n}: ${km(b)} > ${km(a)}`)
    checkRoutes(b.routes)
  }
})

test('entrada vazia e sem veículo', () => {
  assert.deepEqual(planRoutes({ depot, start }), { routes: [], unassigned: [] })
  const { unassigned } = planRoutes({ deliveries: orders(2), vehicles: [], depot, start })
  assert.ok(unassigned.every((u) => u.reason === 'sem_veiculo'))
})

test('pedido sem coordenada é ignorado com motivo', () => {
  const list = [{ ...orders(1)[0], id: 'nocoord', lat: null, lng: null }, { ...orders(2)[1], lng: '' }]
  const { routes, unassigned } = planRoutes({ deliveries: list, vehicles: fleet, depot, start })
  assert.equal(routes.length, 0)
  assert.ok(unassigned.every((u) => u.reason === 'sem_coordenada'))
  assert.equal(unassigned.length, 2)
})

test('urgente entra na rota mesmo com frota escassa', () => {
  const list = orders()
  list[3].window_start = new Date(start).toISOString()
  const { routes } = planRoutes({ deliveries: list, vehicles: [fleet[0]], depot, start })
  assert.equal(routes[0].stops[0].delivery.priority, 'urgente')
})
