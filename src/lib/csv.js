// Validação de pedidos (formulário e CSV, PLANO.md seção 7). Sem dependência de import.meta: roda no node --test.
import Papa from 'papaparse'

export const DEFAULT_PURPOSE = 'Execução da entrega contratada'
const PRIORITY_VALUES = ['baixa', 'normal', 'alta', 'urgente']

export const toNumber = (v) => {
  const s = String(v ?? '').trim().replace(',', '.')
  return s === '' ? NaN : Number(s)
}

// 'AAAA-MM-DD HH:mm' (ou com 'T') em horário de Brasília → ISO; null se inválida (inclui 31/02 etc.).
export function brtToIso(v) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}:00-03:00`)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getTime() - 3 * 36e5).toISOString().slice(0, 16) === `${m[1]}T${m[2]}` ? d.toISOString() : null
}

export const digits = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * Valida um pedido com campos em texto (nomes das colunas de public.deliveries).
 * Retorna { errors: {campo: mensagem}, row } — row pronto para insert quando errors está vazio.
 */
export function validateDelivery(v) {
  const e = {}
  const t = (k) => String(v[k] ?? '').trim()
  if (!t('code')) e.code = 'Informe o código do pedido.'
  if (!t('recipient_name')) e.recipient_name = 'Informe o nome do destinatário.'
  if (!t('address')) e.address = 'Informe o endereço com rua, número, bairro e cidade.'
  if (!t('region')) e.region = 'Informe a região (ex.: Zona Sul).'

  const phone = digits(v.recipient_phone)
  if (t('recipient_phone') && (phone.length < 10 || phone.length > 13)) {
    e.recipient_phone = 'Use DDD + número, só dígitos (ex.: 11988887777).'
  }

  const hasLat = t('lat') !== '', hasLng = t('lng') !== ''
  const lat = toNumber(v.lat), lng = toNumber(v.lng)
  if (hasLat !== hasLng) e[hasLat ? 'lng' : 'lat'] = 'Preencha latitude e longitude juntas, ou deixe as duas vazias.'
  if (hasLat && !(lat >= -90 && lat <= 90)) e.lat = 'Latitude deve ficar entre -90 e 90 (ex.: -23.5640).'
  if (hasLng && !(lng >= -180 && lng <= 180)) e.lng = 'Longitude deve ficar entre -180 e 180 (ex.: -46.6527).'

  const ws = brtToIso(v.window_start), we = brtToIso(v.window_end)
  if (!t('window_start')) e.window_start = 'Informe o início da janela.'
  else if (!ws) e.window_start = 'Use data e hora no formato AAAA-MM-DD HH:mm.'
  if (!t('window_end')) e.window_end = 'Informe o fim da janela.'
  else if (!we) e.window_end = 'Use data e hora no formato AAAA-MM-DD HH:mm.'
  else if (ws && we <= ws) e.window_end = 'O fim da janela precisa ser depois do início.'

  const weight = toNumber(v.weight_kg), volume = toNumber(v.volume_m3)
  if (!(weight > 0)) e.weight_kg = 'Informe um peso maior que zero (kg).'
  if (!(volume > 0)) e.volume_m3 = 'Informe um volume maior que zero (m³).'

  const priority = t('priority') || 'normal'
  if (!PRIORITY_VALUES.includes(priority)) e.priority = 'Use baixa, normal, alta ou urgente.'

  return {
    errors: e,
    row: {
      code: t('code'),
      recipient_name: t('recipient_name'),
      recipient_phone: phone || null,
      address: t('address'),
      region: t('region'),
      lat: hasLat ? lat : null,
      lng: hasLng ? lng : null,
      window_start: ws,
      window_end: we,
      weight_kg: weight,
      volume_m3: volume,
      priority,
      consent: Boolean(v.consent),
      purpose: t('purpose') || DEFAULT_PURPOSE,
    },
  }
}

const COLUMNS = {
  codigo: 'code', destinatario: 'recipient_name', telefone: 'recipient_phone', endereco: 'address',
  regiao: 'region', lat: 'lat', lng: 'lng', janela_inicio: 'window_start', janela_fim: 'window_end',
  peso_kg: 'weight_kg', volume_m3: 'volume_m3', prioridade: 'priority', finalidade: 'purpose',
}
export const REQUIRED_COLUMNS = ['codigo', 'destinatario', 'endereco', 'regiao', 'janela_inicio', 'janela_fim',
  'peso_kg', 'volume_m3', 'consentimento']

/**
 * Lê o CSV de pedidos. `existing` = códigos que já estão no banco.
 * Retorna { missing: [colunas ausentes], items: [{ line, code, reasons: [], row }] }.
 */
export function parseOrdersCsv(text, existing = new Set()) {
  const res = Papa.parse(String(text).replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [';', ','],
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const fields = res.meta.fields ?? []
  const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c))
  if (missing.length) return { missing, items: [] }

  const badShape = new Set(res.errors.filter((er) => er.row != null).map((er) => er.row))
  const seen = new Set()
  const items = res.data.map((rec, i) => {
    const input = {}
    for (const [col, key] of Object.entries(COLUMNS)) input[key] = rec[col] ?? ''
    const consent = String(rec.consentimento ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    input.consent = consent === 'sim'
    const { errors, row } = validateDelivery(input)
    const reasons = Object.values(errors)
    if (consent !== 'sim' && consent !== 'nao') reasons.push('Consentimento deve ser "sim" ou "nao".')
    if (badShape.has(i)) reasons.push('Quantidade de colunas diferente do cabeçalho.')
    if (row.code && seen.has(row.code)) reasons.push(`Código ${row.code} repetido no arquivo.`)
    else if (row.code && existing.has(row.code)) reasons.push(`Código ${row.code} já está cadastrado.`)
    seen.add(row.code)
    return { line: i + 2, code: row.code, reasons, row }
  })
  return { missing, items }
}
