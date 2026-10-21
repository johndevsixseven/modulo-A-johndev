// Roteirização local (RF05, RNF06): função pura, sem rede e sem IA.
// 1. Cada veículo (mais barato por km primeiro) monta a rota por "vizinho mais próximo em tempo":
//    a próxima parada é a que começa a ser atendida mais cedo (deslocamento + espera da janela),
//    com peso por prioridade, entre as que cabem em kg, m³, janela e autonomia (ida + volta ao depósito).
// 2. 2-opt: inverte trechos enquanto a distância cai e todas as restrições continuam válidas.
// 3. O que sobrar vira "não alocado" com motivo.
// Distância = haversine × fator_rua; tempo = distância ÷ vel_media_kmh + tempo_parada_min por parada.

export const DEFAULT_CONFIG = { vel_media_kmh: 25, tempo_parada_min: 5, fator_rua: 1.3 }

export const REASONS = {
  sem_coordenada: 'Sem coordenada: localize o endereço na tela Pedidos.',
  sem_veiculo: 'Nenhum veículo selecionado.',
  capacidade: 'Peso ou volume maior que a capacidade de todos os veículos selecionados.',
  autonomia: 'Ida e volta ao depósito passam da autonomia de todos os veículos selecionados.',
  janela: 'A janela de entrega termina antes que um veículo consiga chegar.',
  frota: 'Os veículos selecionados já estão cheios, sem autonomia ou sem horário compatível.',
}

// Menor peso = escolhida antes, mesmo se um pouco mais longe.
const PRIORITY_WEIGHT = { urgente: 0.25, alta: 0.5, normal: 1, baixa: 1.25 }

export function haversineKm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const ms = (v) => (typeof v === 'number' ? v : Date.parse(v))
const isNum = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const hasCoord = (d) => isNum(d.lat) && isNum(d.lng)
const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param {object} p
 * @param {Array} p.deliveries {id, lat, lng, weight_kg, volume_m3, window_start, window_end, priority}
 * @param {Array} p.vehicles   {id, capacity_kg, capacity_m3, range_km, cost_per_km}
 * @param {{lat:number,lng:number}} p.depot
 * @param {number|string} p.start saída do depósito (ms ou ISO)
 * @param {object} [p.config] settings.roteirizacao
 * @param {boolean} [p.twoOpt=true]
 */
export function planRoutes({ deliveries = [], vehicles = [], depot, start, config = {}, twoOpt = true }) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const t0 = ms(start)
  const dist = (a, b) => haversineKm(a, b) * cfg.fator_rua
  const travelMs = (km) => (km / cfg.vel_media_kmh) * 36e5
  const stopMs = cfg.tempo_parada_min * 6e4
  const dep = { lat: Number(depot.lat), lng: Number(depot.lng) }

  const unassigned = []
  const pool = []
  for (const d of deliveries) {
    if (!hasCoord(d)) { unassigned.push({ delivery: d, reason: 'sem_coordenada' }); continue }
    pool.push({
      src: d, lat: Number(d.lat), lng: Number(d.lng), kg: Number(d.weight_kg), m3: Number(d.volume_m3),
      ws: ms(d.window_start), we: ms(d.window_end), w: PRIORITY_WEIGHT[d.priority] ?? 1,
    })
  }
  // Empate de custo → menor fim de janela (ordem estável).
  pool.sort((a, b) => a.we - b.we)

  // Simula uma sequência; null se violar janela, capacidade ou autonomia.
  function simulate(seq, v) {
    let pos = dep, time = t0, km = 0, kg = 0, m3 = 0
    const etas = []
    for (const s of seq) {
      const leg = dist(pos, s)
      km += leg
      const eta = Math.max(time + travelMs(leg), s.ws)
      if (eta > s.we) return null
      etas.push(eta)
      time = eta + stopMs
      pos = s; kg += s.kg; m3 += s.m3
    }
    const back = dist(pos, dep)
    km += back
    if (kg > v.capacity_kg || m3 > v.capacity_m3 || km > v.range_km) return null
    return { km, end: time + travelMs(back), etas, kg, m3 }
  }

  const routes = []
  const fleet = [...vehicles].sort((a, b) => a.cost_per_km - b.cost_per_km || a.capacity_kg - b.capacity_kg)
  for (const v of fleet) {
    let seq = []
    let pos = dep, time = t0, km = 0, kg = 0, m3 = 0
    for (;;) {
      let best = null, bestCost = Infinity, bestEta = 0, bestLeg = 0
      for (const c of pool) {
        if (kg + c.kg > v.capacity_kg || m3 + c.m3 > v.capacity_m3) continue
        const leg = dist(pos, c)
        if (km + leg + dist(c, dep) > v.range_km) continue
        const eta = Math.max(time + travelMs(leg), c.ws)
        if (eta > c.we) continue
        const cost = (eta - time) * c.w
        if (cost < bestCost) { best = c; bestCost = cost; bestEta = eta; bestLeg = leg }
      }
      if (!best) break
      seq.push(best)
      pool.splice(pool.indexOf(best), 1)
      km += bestLeg; time = bestEta + stopMs; pos = best; kg += best.kg; m3 += best.m3
    }
    if (!seq.length) continue

    let sim = simulate(seq, v)
    if (twoOpt) {
      for (let improved = true; improved;) {
        improved = false
        for (let i = 0; i < seq.length - 1; i++) {
          for (let k = i + 1; k < seq.length; k++) {
            const cand = [...seq.slice(0, i), ...seq.slice(i, k + 1).reverse(), ...seq.slice(k + 1)]
            const s = simulate(cand, v)
            if (s && s.km < sim.km - 1e-9) { seq = cand; sim = s; improved = true }
          }
        }
      }
    }

    routes.push({
      vehicle: v,
      stops: seq.map((s, i) => ({ delivery: s.src, order: i + 1, eta: new Date(sim.etas[i]).toISOString() })),
      total_km: round2(sim.km),
      total_min: Math.round((sim.end - t0) / 6e4),
      est_cost: round2(sim.km * Number(v.cost_per_km)),
      load_kg: round2(sim.kg),
      load_m3: Math.round(sim.m3 * 1000) / 1000,
      geometry: [[dep.lat, dep.lng], ...seq.map((s) => [s.lat, s.lng]), [dep.lat, dep.lng]],
    })
  }

  // Motivo do que sobrou: o primeiro impedimento que vale para todos os veículos.
  for (const c of pool) {
    let reason = 'frota'
    if (!vehicles.length) reason = 'sem_veiculo'
    else if (!vehicles.some((v) => c.kg <= v.capacity_kg && c.m3 <= v.capacity_m3)) reason = 'capacidade'
    else if (!vehicles.some((v) => 2 * dist(dep, c) <= v.range_km)) reason = 'autonomia'
    else if (t0 + travelMs(dist(dep, c)) > c.we) reason = 'janela'
    unassigned.push({ delivery: c.src, reason })
  }

  return { routes, unassigned }
}
