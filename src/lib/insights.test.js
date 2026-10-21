import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAggregates, localInsights } from './insights.js'
import { detectIntent } from './chatFallback.js'

test('agregados: custo rateado por região, falha, atraso por hora e ocupação', () => {
  const routes = [{ id: 'r1', total_km: 10, load_kg: 40, vehicle: { plate: 'ABC1D23', capacity_kg: 100, cost_per_km: 2 } }]
  const deliveries = [
    { region: 'Centro', status: 'entregue', route_id: 'r1', window_end: '2026-10-21T13:00:00Z', delivered_at: '2026-10-21T14:00:00Z' },
    { region: 'Zona Sul', status: 'falha', route_id: 'r1', window_end: '2026-10-21T15:00:00Z', delivered_at: null },
  ]
  const agg = buildAggregates({ otd: 0, total: 2, finalizadas: 2 }, deliveries, routes)
  assert.deepEqual(agg.regioes.map((r) => [r.regiao, r.custo_por_entrega, r.taxa_falha]), [['Centro', 10, 0], ['Zona Sul', 10, 1]])
  assert.deepEqual(agg.atrasos_hora, [{ hora: '10h', total: 1 }, { hora: '12h', total: 1 }])
  assert.deepEqual(agg.ocupacao_veiculos, [{ placa: 'ABC1D23', ocupacao: 0.4 }])
  const ins = localInsights(agg)
  assert.match(ins.gargalos.join(' '), /OTD de 0%/)
  assert.match(ins.gargalos.join(' '), /Zona Sul/)
  assert.match(ins.gargalos.join(' '), /ABC1D23/)
})

test('insights sem dados', () => {
  const ins = localInsights(buildAggregates(null, [], []))
  assert.equal(ins.resumo, 'Sem entregas no período selecionado.')
})

test('chat: intenção por palavra-chave', () => {
  assert.deepEqual(detectIntent('qual o status da entrega PED-0001?'), { type: 'entrega', code: 'PED-0001' })
  assert.equal(detectIntent('quantas entregas atrasadas?').type, 'atrasadas')
  assert.equal(detectIntent('qual o OTD de hoje').type, 'otd')
  assert.equal(detectIntent('custo por entrega').type, 'custo')
  assert.equal(detectIntent('tem alertas?').type, 'alertas')
  assert.equal(detectIntent('como faço roteirização?').screen.rota, '/roteirizacao')
  assert.equal(detectIntent('onde vejo usuários', 'motorista').type, 'tela')
  assert.equal(detectIntent('oi').type, 'ajuda')
})
