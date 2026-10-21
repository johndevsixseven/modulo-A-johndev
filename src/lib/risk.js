// RF09 — Risco de atraso/falha por entrega (regras locais, sem IA; RNF06). Pontuação 0–100.
import { haversineKm } from './routing.js'

export const RISK_LEVELS = { baixo: 'Baixo', medio: 'Médio', critico: 'Crítico' }
export const RISK_ACTIONS = { replanejar: 'Replanejar', priorizar: 'Priorizar', contatar_cliente: 'Contatar cliente' }

const FAR_KM = 20 // distância de rua do depósito acima da qual a entrega pesa no risco
const HIGH_FAIL = 0.3 // taxa de falha da região que pede contato com o cliente

export const riskLevel = (score, critico = 60) => (score >= critico ? 'critico' : score >= 30 ? 'medio' : 'baixo')

/**
 * d: entrega { window_start, window_end, eta, route_id, priority, region, lat, lng }.
 * ctx: { now (ms), failRate: {região: 0..1}, vehicleIssue (bool: veículo parado/em manutenção), depot {lat,lng},
 *        fatorRua, critico }.
 * Retorna { score, level, reasons[], actions[] }.
 */
export function scoreDelivery(d, ctx) {
  const now = ctx.now ?? Date.now()
  const reasons = []
  const actions = new Set()
  let score = 0
  const add = (pts, why) => { if (pts > 0) { score += pts; reasons.push(why) } }

  const end = Date.parse(d.window_end)
  const ref = d.eta ? Date.parse(d.eta) : now // sem ETA, a folga é contada a partir de agora
  const slackMin = (end - ref) / 6e4
  if (slackMin < 0) { add(50, d.eta ? 'ETA depois do fim da janela' : 'Janela já encerrada'); actions.add('replanejar') }
  else if (slackMin < 30) add(25, `Folga de ${Math.round(slackMin)} min na janela`)
  else if (slackMin < 60) add(10, `Folga de ${Math.round(slackMin)} min na janela`)

  const noRouteSoon = !d.route_id && Date.parse(d.window_start) < now + 2 * 36e5
  if (noRouteSoon) add(20, 'Sem rota e janela começa em menos de 2 h')
  if (d.priority === 'urgente') {
    add(10, 'Prioridade urgente')
    if (!d.route_id) actions.add('priorizar')
  } else if (noRouteSoon) actions.add('priorizar')

  if (ctx.vehicleIssue) add(15, 'Veículo da rota parado ou em manutenção')

  if (ctx.depot && d.lat != null && d.lng != null) {
    const km = haversineKm(ctx.depot, d) * (ctx.fatorRua ?? 1.3)
    if (km > FAR_KM) add(10, `Distante do depósito (${Math.round(km)} km)`)
  }

  const rate = ctx.failRate?.[d.region] ?? 0
  add(Math.round(rate * 30), `Falha histórica de ${Math.round(rate * 100)}% na região`)
  if (rate >= HIGH_FAIL) actions.add('contatar_cliente')

  score = Math.min(100, score)
  return { score, level: riskLevel(score, ctx.critico), reasons, actions: [...actions] }
}

// rows: [{ region, status }] de entregas finalizadas → { região: falhas ÷ (entregues + falhas) }.
export function failRates(rows) {
  const acc = {}
  for (const r of rows) {
    const a = (acc[r.region] ??= { f: 0, t: 0 })
    a.t++
    if (r.status === 'falha') a.f++
  }
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, a.f / a.t]))
}
