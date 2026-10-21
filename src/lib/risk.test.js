import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failRates, riskLevel, scoreDelivery } from './risk.js'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const at = (min) => new Date(NOW + min * 6e4).toISOString()
const base = { window_start: at(120), window_end: at(300), eta: at(150), route_id: 'r1', priority: 'normal', region: 'Centro' }

test('entrega folgada → baixo, sem ações', () => {
  const r = scoreDelivery(base, { now: NOW })
  assert.equal(r.score, 0)
  assert.equal(r.level, 'baixo')
  assert.deepEqual(r.actions, [])
})

test('ETA estourado + urgente + veículo parado + falha 50% → crítico, replanejar e contatar', () => {
  const r = scoreDelivery({ ...base, eta: at(320), priority: 'urgente' },
    { now: NOW, vehicleIssue: true, failRate: { Centro: 0.5 } })
  assert.equal(r.score, 50 + 10 + 15 + 15)
  assert.equal(r.level, 'critico')
  assert.deepEqual(r.actions.sort(), ['contatar_cliente', 'replanejar'])
})

test('sem rota, janela em 1 h, urgente, folga 20 min → priorizar', () => {
  const r = scoreDelivery({ ...base, route_id: null, eta: null, window_start: at(-60), window_end: at(20), priority: 'urgente' }, { now: NOW })
  assert.equal(r.score, 25 + 20 + 10)
  assert.equal(r.level, 'medio')
  assert.deepEqual(r.actions, ['priorizar'])
})

test('limite 100 e distância', () => {
  const r = scoreDelivery({ ...base, eta: at(400), priority: 'urgente', route_id: null, window_start: at(0), lat: -23.0, lng: -46.0 },
    { now: NOW, vehicleIssue: true, failRate: { Centro: 1 }, depot: { lat: -23.55, lng: -46.63 } })
  assert.equal(r.score, 100)
  assert.ok(r.reasons.some((x) => x.startsWith('Distante')))
})

test('níveis e taxa de falha', () => {
  assert.equal(riskLevel(29), 'baixo')
  assert.equal(riskLevel(30), 'medio')
  assert.equal(riskLevel(60), 'critico')
  assert.deepEqual(failRates([{ region: 'A', status: 'falha' }, { region: 'A', status: 'entregue' }]), { A: 0.5 })
})
