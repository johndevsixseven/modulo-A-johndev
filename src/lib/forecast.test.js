import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, forecastDemand } from './forecast.js'

const TODAY = '2026-10-21' // quarta-feira

test('série constante → previsão igual à média, fatores 1', () => {
  const rows = Array.from({ length: 56 }, (_, i) => ({ region: 'Centro', day: addDays(TODAY, -1 - i), total: 10 }))
  const [f] = forecastDemand(rows, TODAY)
  assert.equal(f.region, 'Centro')
  assert.equal(f.mm28, 10)
  assert.deepEqual(f.d7, [10, 10, 10, 10, 10, 10, 10])
  assert.equal(f.d7_total, 70)
  assert.equal(f.d30_total, 300)
})

test('fator do dia da semana: só segundas têm entrega', () => {
  const rows = []
  for (let i = 1; i <= 56; i++) {
    const day = addDays(TODAY, -i)
    if (new Date(day + 'T00:00:00Z').getUTCDay() === 1) rows.push({ region: 'Sul', day, total: 14 })
  }
  const [f] = forecastDemand(rows, TODAY)
  assert.equal(f.mm28, 2) // 4 segundas × 14 ÷ 28
  assert.equal(f.factors[1], 7) // 14 ÷ 2
  const monday = f.daily.find((d) => new Date(d.day + 'T00:00:00Z').getUTCDay() === 1)
  assert.equal(monday.value, 14)
  assert.equal(f.daily.filter((d) => d.value > 0).length, 4) // 30 dias a partir de quarta: 4 segundas
})

test('região sem histórico recente → zeros sem NaN', () => {
  const [f] = forecastDemand([{ region: 'Norte', day: addDays(TODAY, -200), total: 5 }], TODAY)
  assert.deepEqual(f.d7, [0, 0, 0, 0, 0, 0, 0])
  assert.equal(f.d30_total, 0)
})
