import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trackPoints } from './track.js'

test('trackPoints começa e termina nas pontas e espaça por distância', () => {
  const g = [[0, 0], [0, 1], [0, 3]] // segmentos de 1 e 2 "unidades"
  const pts = trackPoints(g, 4)
  assert.equal(pts.length, 4)
  assert.deepEqual(pts[0], [0, 0])
  assert.deepEqual(pts[3], [0, 3])
  assert.ok(Math.abs(pts[1][1] - 1) < 1e-6)
  assert.ok(Math.abs(pts[2][1] - 2) < 1e-6)
})

test('trackPoints com geometria vazia ou de um ponto', () => {
  assert.deepEqual(trackPoints([], 5), [])
  assert.deepEqual(trackPoints([[1, 2]], 5), [[1, 2]])
})
