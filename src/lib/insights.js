// Agregados do período para a Análise Inteligente (RF12) e regras locais (fallback da IA).
// Sem dependências de navegador: testado em insights.test.js.

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const hourBR = (iso) => (new Date(iso).getUTCHours() + 21) % 24 // Brasília = UTC−3

// deliveries: [{region, status, window_end, delivered_at, route_id}]
// routes:     [{id, total_km, load_kg, vehicle:{plate, capacity_kg, cost_per_km}}]
export function buildAggregates(kpis, deliveries, routes) {
  const routeById = new Map(routes.map((r) => [r.id, r]))
  const perRoute = new Map()
  for (const d of deliveries) if (d.route_id) perRoute.set(d.route_id, (perRoute.get(d.route_id) || 0) + 1)

  const reg = {}
  const late = {}
  for (const d of deliveries) {
    const r = (reg[d.region] ??= { regiao: d.region, custo: 0, finalizadas: 0, falhas: 0 })
    const route = routeById.get(d.route_id)
    // Custo da rota rateado igualmente entre as entregas dela.
    if (route) r.custo += (route.total_km * (route.vehicle?.cost_per_km ?? 0)) / perRoute.get(d.route_id)
    if (d.status === 'entregue' || d.status === 'falha') r.finalizadas++
    if (d.status === 'falha') r.falhas++
    const atrasada = d.status === 'entregue' ? d.delivered_at > d.window_end : d.status === 'falha'
    if (atrasada) late[hourBR(d.window_end)] = (late[hourBR(d.window_end)] || 0) + 1
  }

  return {
    kpis: {
      otd: kpis?.otd ?? null, custo_por_entrega: kpis?.custo_por_entrega ?? null,
      km_rodados: kpis?.km_rodados ?? 0, ocupacao: kpis?.ocupacao ?? null,
      total: kpis?.total ?? deliveries.length, finalizadas: kpis?.finalizadas ?? 0,
    },
    regioes: Object.values(reg).map((r) => ({
      regiao: r.regiao,
      custo_por_entrega: r.finalizadas ? round(r.custo / r.finalizadas) : null,
      taxa_falha: r.finalizadas ? round(r.falhas / r.finalizadas, 4) : 0,
      finalizadas: r.finalizadas,
    })),
    atrasos_hora: Object.entries(late).map(([h, total]) => ({ hora: `${String(h).padStart(2, '0')}h`, total }))
      .sort((a, b) => a.hora.localeCompare(b.hora)),
    ocupacao_veiculos: routes.filter((r) => r.vehicle?.capacity_kg)
      .map((r) => ({ placa: r.vehicle.plate, ocupacao: round(r.load_kg / r.vehicle.capacity_kg, 4) })),
  }
}

const pct = (n) => `${Math.round(n * 100)}%`

// Regras locais: mesmo formato da ação `insights` da IA.
export function localInsights(agg) {
  const { kpis, regioes, atrasos_hora, ocupacao_veiculos } = agg
  const gargalos = []
  const recomendacoes = []
  const comCusto = regioes.filter((r) => r.custo_por_entrega != null).sort((a, b) => b.custo_por_entrega - a.custo_por_entrega)
  const maiorFalha = [...regioes].sort((a, b) => b.taxa_falha - a.taxa_falha)[0]
  const piorHora = [...atrasos_hora].sort((a, b) => b.total - a.total)[0]
  const ociosos = ocupacao_veiculos.filter((v) => v.ocupacao < 0.5)

  if (kpis.otd != null && kpis.otd < 0.9) {
    gargalos.push(`OTD de ${pct(kpis.otd)}, abaixo da meta de 90%.`)
    recomendacoes.push('Revisar janelas e sequência das rotas com mais atrasos.')
  }
  if (maiorFalha?.taxa_falha > 0) {
    gargalos.push(`${maiorFalha.regiao} tem a maior taxa de falha (${pct(maiorFalha.taxa_falha)}).`)
    recomendacoes.push(`Confirmar contato e endereço dos destinatários em ${maiorFalha.regiao} antes da saída.`)
  }
  if (piorHora) {
    gargalos.push(`Mais atrasos com janela terminando às ${piorHora.hora} (${piorHora.total}).`)
    recomendacoes.push(`Antecipar a saída das rotas com entregas até ${piorHora.hora}.`)
  }
  if (ociosos.length) {
    gargalos.push(`${ociosos.length} rota(s) com ocupação abaixo de 50% (${ociosos.map((v) => v.placa).join(', ')}).`)
    recomendacoes.push('Consolidar cargas em menos veículos ou usar veículos menores.')
  }
  const regioes_custo = comCusto.slice(0, 3).map((r) => `${r.regiao}: R$ ${r.custo_por_entrega.toFixed(2)} por entrega`)
  if (!recomendacoes.length) recomendacoes.push('Indicadores dentro do esperado; manter o planejamento atual.')

  const resumo = kpis.total
    ? `${kpis.total} entregas no período, ${kpis.finalizadas} finalizadas` +
      (kpis.otd != null ? `, OTD ${pct(kpis.otd)}` : '') +
      (comCusto[0] ? `. Região mais cara: ${comCusto[0].regiao}.` : '.')
    : 'Sem entregas no período selecionado.'
  return { resumo, gargalos, regioes_custo, recomendacoes }
}
