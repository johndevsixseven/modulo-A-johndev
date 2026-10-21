import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { dbMessage } from '../lib/dbError.js'
import { formatDateTime } from '../lib/labels.js'
import { runAlertCheck } from '../lib/useAlerts.js'
import DataTable from '../components/DataTable.jsx'

const ALERT_TYPES = {
  entrega_atrasada: 'Entrega atrasada', veiculo_parado: 'Veículo parado', fora_da_rota: 'Fora da rota',
  manutencao_vencendo: 'Manutenção vencendo', cnh_vencendo: 'CNH vencendo', risco_alto: 'Risco alto',
}
const SEVERITY = { baixa: ['Baixa', 'ok'], media: ['Média', 'warn'], alta: ['Alta', 'danger'] }
const TABS = { aberto: 'Abertos', resolvido: 'Resolvidos', log: 'Log de notificações' }

// RF11 — painel de alertas. Também pode ser encaixado no Dashboard como componente.
export default function Alertas() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('aberto')
  const [type, setType] = useState('')
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const q = tab === 'log'
      ? supabase.from('notification_log').select('id, channel, recipient, success, error, created_at, alert:alerts(title, type)')
        .order('created_at', { ascending: false }).limit(300)
      : supabase.from('alerts').select('id, type, severity, title, message, created_at, resolved_at')
        .eq('status', tab).order('created_at', { ascending: false }).limit(300)
    const { data, error } = await q
    if (error) setMsg({ text: dbMessage(error), error: true })
    setRows(data ?? [])
  }, [tab])

  useEffect(() => {
    load()
    const ch = supabase.channel('alertas-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function check() {
    setBusy(true)
    const { created, error } = await runAlertCheck()
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `${created} alerta(s) novo(s).`, error: false })
    setBusy(false)
    load()
  }

  async function resolve(a) {
    const { error } = await supabase.from('alerts')
      .update({ status: 'resolvido', resolved_at: new Date().toISOString(), resolved_by: profile.id }).eq('id', a.id)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `Alerta "${a.title}" resolvido.`, error: false })
    load()
  }

  const shown = (rows ?? []).filter((r) => !type || (tab === 'log' ? r.alert?.type : r.type) === type)

  const alertCols = [
    { key: 'created_at', label: 'Criado em', render: (r) => formatDateTime(r.created_at) },
    { key: 'type', label: 'Tipo', value: (r) => ALERT_TYPES[r.type] },
    { key: 'severity', label: 'Severidade', value: (r) => SEVERITY[r.severity][0],
      render: (r) => <span className={`badge ${SEVERITY[r.severity][1]}`}>{SEVERITY[r.severity][0]}</span> },
    { key: 'title', label: 'Alerta' },
    { key: 'message', label: 'Detalhe' },
    tab === 'aberto'
      ? { key: 'acao', label: 'Ação', sortable: false, value: () => '',
          render: (r) => <button type="button" onClick={() => resolve(r)}>Marcar “{r.title}” como resolvido</button> }
      : { key: 'resolved_at', label: 'Resolvido em', render: (r) => formatDateTime(r.resolved_at) },
  ]
  const logCols = [
    { key: 'created_at', label: 'Data', render: (r) => formatDateTime(r.created_at) },
    { key: 'channel', label: 'Canal', value: (r) => (r.channel === 'email' ? 'E-mail' : 'Painel') },
    { key: 'alert', label: 'Alerta', value: (r) => r.alert?.title ?? '—' },
    { key: 'recipient', label: 'Destinatário' },
    { key: 'success', label: 'Situação', value: (r) => (r.success ? 'Enviado' : 'Não enviado'),
      render: (r) => <span className={`badge ${r.success ? 'ok' : 'warn'}`}>{r.success ? 'Enviado' : 'Não enviado'}</span> },
    { key: 'error', label: 'Motivo' },
  ]

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Alertas</h1>
        <button type="button" onClick={check} disabled={busy}>{busy ? 'Verificando…' : 'Verificar alertas agora'}</button>
      </div>
      <p className="page-desc">Atrasos, falhas e vencimentos que pedem ação. A verificação também roda sozinha a cada 60 s enquanto alguém da equipe estiver logado.</p>
      <div className="row-actions" role="group" aria-label="Visão">
        {Object.entries(TABS).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? '' : 'secondary'} aria-pressed={tab === k}
            onClick={() => { setRows(null); setTab(k) }}>{l}</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="filtro-tipo">Tipo de alerta</label>
        <select id="filtro-tipo" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(ALERT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {msg.text && <p className={msg.error ? 'error' : 'success'} role={msg.error ? 'alert' : 'status'}>{msg.text}</p>}
      {rows === null ? <p role="status">Carregando…</p> : (
        <DataTable key={tab} columns={tab === 'log' ? logCols : alertCols} rows={shown} caption={TABS[tab]}
          empty={<div className="empty"><p>Nada em “{TABS[tab]}”{type ? ` do tipo ${ALERT_TYPES[type]}` : ''}.</p>
            {type && <button type="button" className="secondary" onClick={() => setType('')}>Mostrar todos os tipos</button>}</div>} />
      )}
    </section>
  )
}
