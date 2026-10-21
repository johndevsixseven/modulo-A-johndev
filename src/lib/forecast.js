// RF08 — Previsão de demanda por região (cálculo local, sem IA; RNF06).
// previsão(dia) = média móvel dos últimos 28 dias × fator do dia da semana
// fator(dds) = média daquele dia da semana no histórico ÷ média geral do histórico (1 se não houver dados).

export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const dow = (day) => new Date(day + 'T00:00:00Z').getUTCDay()
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
const round1 = (x) => Math.round(x * 10) / 10

/**
 * rows: [{ region, day: 'AAAA-MM-DD', total }] (saída de rpc('demand_history')).
 * today: 'AAAA-MM-DD' (o histórico vai até ontem). histDays: tamanho do histórico considerado.
 * Retorna [{ region, mm28, factors[7], daily: [{day, value}] (30 dias), d7: [7], d7_total, d30_total }].
 */
export function forecastDemand(rows, today, { histDays = 56, window = 28, horizon = 30 } = {}) {
  const regions = [...new Set(rows.map((r) => r.region))].sort()
  return regions.map((region) => {
    const byDay = new Map(rows.filter((r) => r.region === region).map((r) => [r.day, Number(r.total) || 0]))
    // Série contínua (dias sem entrega = 0), do mais antigo até ontem.
    const hist = Array.from({ length: histDays }, (_, i) => {
      const day = addDays(today, i - histDays)
      return { day, value: byDay.get(day) ?? 0 }
    })
    const mm28 = avg(hist.slice(-window).map((h) => h.value))
    const overall = avg(hist.map((h) => h.value))
    const factors = Array.from({ length: 7 }, (_, d) => {
      const m = avg(hist.filter((h) => dow(h.day) === d).map((h) => h.value))
      return overall > 0 ? m / overall : 1
    })
    const daily = Array.from({ length: horizon }, (_, i) => {
      const day = addDays(today, i)
      return { day, value: round1(mm28 * factors[dow(day)]) }
    })
    const d7 = daily.slice(0, 7).map((d) => d.value)
    return {
      region, mm28: round1(mm28), factors: factors.map((f) => Math.round(f * 100) / 100), daily, d7,
      d7_total: Math.round(d7.reduce((s, x) => s + x, 0)),
      d30_total: Math.round(daily.reduce((s, d) => s + d.value, 0)),
    }
  })
}
