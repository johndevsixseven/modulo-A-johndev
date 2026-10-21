import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { dbMessage } from '../lib/dbError.js'
import { callAI } from '../lib/ai.js'
import { PRIORITIES, formatDateTime } from '../lib/labels.js'
import { RISK_ACTIONS, RISK_LEVELS, failRates, scoreDelivery } from '../lib/risk.js'
import DataTable from '../components/DataTable.jsx'

const LEVEL_CLASS = { baixo: 'ok', medio: 'warn', critico: 'danger' }
const ACTIVE = ['pendente', 'planejada', 'a_caminho']

async function loadAll() {
  const since = new Date(Date.now() - 90 * 864e5).toISOString()
  const [del, hist, parados, sets] = await Promise.all([
    supabase.from('deliveries')
      .select('id, code, region, priority, status, window_start, window_end, eta, route_id, lat, lng, risk_score, risk_level, route:routes(vehicle_id, vehicle:vehicles(status))')
      .in('status', ACTIVE).limit(1000),
    // shortcut: taxa de falha calculada no cliente com até 5000 entregas de 90 dias; mover para RPC se crescer.
    supabase.from('deliveries').select('region, status').in('status', ['entregue', 'falha'])
      .gte('window_start', since).limit(5000),
    supabase.from('alerts').select('vehicle_id').eq('type', 'veiculo_parado').eq('status', 'aberto'),
    supabase.from('settings').select('key, value').in('key', ['alertas', 'deposito', 'roteirizacao']),
  ])
  const error = del.error || hist.error || parados.error || sets.error
  if (error) return { error }
  const s = Object.fromEntries(sets.data.map((r) => [r.key, r.value]))
  const stopped = new Set(parados.data.map((a) => a.vehicle_id))
  const ctx = {
    now: Date.now(), failRate: failRates(hist.data), depot: s.deposito,
    fatorRua: s.roteirizacao?.fator_rua, critico: s.alertas?.risco_critico ?? 60,
  }
  const rows = del.data.map((d) => {
    const vid = d.route?.vehicle_id
    const r = scoreDelivery(d, { ...ctx, vehicleIssue: Boolean(vid && (stopped.has(vid) || d.route.vehicle?.status === 'em_manutencao')) })
    return { ...d, ...r }
  }).sort((a, b) => b.score - a.score)
  return { rows }
}

export default function Riscos() {
  const { profile } = useAuth()
  const canWrite = ['admin', 'despachante'].includes(profile.role)
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [ai, setAi] = useState(null)
  const timer = useRef(null)

  const refresh = useCallback(async () => {
    const { rows, error } = await loadAll()
    if (error) { setMsg({ text: dbMessage(error), error: true }); setRows([]); return }
    setRows(rows)
    if (!canWrite) return
    // Grava só o que mudou (evita laço com o tempo real) e deixa o check_alerts gerar 'risco_alto'.
    const changed = rows.filter((r) => r.risk_score !== r.score || r.risk_level !== r.level)
    const res = await Promise.all(changed.map((r) => supabase.from('deliveries')
      .update({ risk_score: r.score, risk_level: r.level, risk_reasons: r.reasons, risk_actions: r.actions }).eq('id', r.id)))
    const failed = res.find((x) => x.error)
    if (failed) setMsg({ text: dbMessage(failed.error), error: true })
    if (changed.some((r) => r.level === 'critico')) await supabase.rpc('check_alerts')
  }, [canWrite])

  useEffect(() => {
    refresh()
    const ch = supabase.channel('riscos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(refresh, 1500)
      })
      .subscribe()
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch) }
  }, [refresh])

  async function prioritize(r) {
    const { error } = await supabase.from('deliveries').update({ priority: 'urgente' }).eq('id', r.id)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `Entrega ${r.code} agora é urgente.`, error: false })
    refresh()
  }

  async function explain() {
    setAi({ busy: true })
    const itens = rows.filter((r) => r.level === 'critico').slice(0, 20)
      .map(({ id, code, region, priority, score, reasons, actions }) => ({ id, code, region, priority, score, reasons, actions }))
    const r = await callAI('risk', { itens })
    setAi(r.ok && !r.fallback ? { data: r.data } : { text: 'IA indisponível no momento: valem os motivos calculados localmente.' })
  }

  if (rows === null) return <p role="status">Calculando riscos…</p>
  const critical = rows.filter((r) => r.level === 'critico').length
  const byId = Object.fromEntries((ai?.data?.itens ?? []).map((i) => [i.id, i.explicacao]))

  const columns = [
    { key: 'score', label: 'Pontuação' },
    { key: 'level', label: 'Nível', value: (r) => RISK_LEVELS[r.level],
      render: (r) => <span className={`badge ${LEVEL_CLASS[r.level]}`}>{RISK_LEVELS[r.level]}</span> },
    { key: 'code', label: 'Pedido' },
    { key: 'region', label: 'Região' },
    { key: 'priority', label: 'Prioridade', value: (r) => PRIORITIES[r.priority] },
    { key: 'window_end', label: 'Fim da janela', render: (r) => formatDateTime(r.window_end) },
    { key: 'reasons', label: 'Motivos', sortable: false, value: (r) => r.reasons.join('; '),
      render: (r) => (r.reasons.length ? <>{r.reasons.join('; ')}{byId[r.id] && <><br /><em>IA: {byId[r.id]}</em></>}</> : '—') },
    { key: 'actions', label: 'Ações sugeridas', sortable: false, value: (r) => r.actions.map((a) => RISK_ACTIONS[a]).join(', '),
      render: (r) => (
        <div className="row-actions">
          {r.actions.length === 0 && '—'}
          {r.actions.includes('contatar_cliente') && <span>Contatar cliente</span>}
          {canWrite && r.actions.includes('priorizar') && r.priority !== 'urgente' &&
            <button type="button" onClick={() => prioritize(r)}>Priorizar {r.code}</button>}
          {canWrite && (r.actions.includes('replanejar') || r.actions.includes('priorizar')) &&
            <button type="button" className="secondary" onClick={() => navigate('/roteirizacao', { state: { pedido: r.id } })}>
              Replanejar {r.code}
            </button>}
        </div>
      ) },
  ]

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Risco de atraso</h1>
        <div className="row-actions">
          <button type="button" className="secondary" onClick={refresh}>Recalcular</button>
          <button type="button" className="secondary" onClick={explain} disabled={!critical || ai?.busy}>
            {ai?.busy ? 'Consultando IA…' : 'Explicar críticas com IA'}
          </button>
        </div>
      </div>
      <p className="hint">{critical} entrega(s) crítica(s). Pontuação 0–100 por regras locais; crítico ≥ limite em Configurações (padrão 60).</p>
      {msg.text && <p className={msg.error ? 'error' : 'success'} role={msg.error ? 'alert' : 'status'}>{msg.text}</p>}
      {ai?.text && <p className="notice" role="status">{ai.text}</p>}
      <DataTable columns={columns} rows={rows} caption="Entregas por risco" searchLabel="Buscar entrega"
        empty={<div className="empty"><p>Nenhuma entrega em aberto para avaliar.</p></div>} />
    </section>
  )
}
