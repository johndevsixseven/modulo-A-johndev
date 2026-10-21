// node --test src/lib
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { brtToIso, parseOrdersCsv } from './csv.js'

test('arquivo de exemplo importa 100%', () => {
  const text = readFileSync(new URL('../../public/exemplo-pedidos.csv', import.meta.url), 'utf8')
  const { missing, items } = parseOrdersCsv(text)
  assert.deepEqual(missing, [])
  assert.equal(items.length, 8)
  assert.deepEqual(items.filter((i) => i.reasons.length), [])
  const p3 = items.find((i) => i.code === 'PED-1003').row
  assert.equal(p3.weight_kg, 2.3) // decimal com vírgula
  assert.equal(p3.window_start, '2026-10-22T13:00:00.000Z') // 10:00 em Brasília
  assert.equal(items.find((i) => i.code === 'PED-1002').row.lat, null) // será geocodificado
  assert.equal(items.find((i) => i.code === 'PED-1004').row.consent, false)
})

test('linhas com erro trazem linha e motivo', () => {
  const csv = [
    'codigo,destinatario,endereco,regiao,janela_inicio,janela_fim,peso_kg,volume_m3,consentimento',
    'A-1,Ana,Rua X 1,Centro,2026-10-22 09:00,2026-10-22 12:00,-3,0.1,sim',
    'A-2,Bia,Rua Y 2,Centro,2026-10-22 12:00,2026-10-22 09:00,1,0.1,talvez',
    'A-1,,Rua Z 3,Centro,2026-02-31 09:00,2026-10-22 12:00,1,0.1,sim',
    'A-9,Caio,Rua W 4,Sul,2026-10-22 09:00,2026-10-22 12:00,1,0.1,sim',
  ].join('\n')
  const { items } = parseOrdersCsv(csv, new Set(['A-9']))
  assert.equal(items[0].line, 2)
  assert.match(items[0].reasons.join(), /peso maior que zero/)
  assert.match(items[1].reasons.join(), /fim da janela precisa ser depois/)
  assert.match(items[1].reasons.join(), /Consentimento/)
  assert.match(items[2].reasons.join(), /repetido/)
  assert.match(items[2].reasons.join(), /destinatário/)
  assert.match(items[2].reasons.join(), /AAAA-MM-DD/) // 31/02 não existe
  assert.match(items[3].reasons.join(), /já está cadastrado/)
})

test('coluna obrigatória ausente', () => {
  assert.deepEqual(parseOrdersCsv('codigo;destinatario\nX;Y').missing.slice(0, 2), ['endereco', 'regiao'])
})

test('brtToIso', () => {
  assert.equal(brtToIso('2026-10-22T23:30'), '2026-10-23T02:30:00.000Z')
  assert.equal(brtToIso('22/10/2026 10:00'), null)
})
