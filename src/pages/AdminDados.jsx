import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import DataTable from '../components/DataTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

// Tabelas exportadas no backup JSON (mesma lista do scripts/backup.mjs).
const TABLES = ['profiles', 'vehicles', 'drivers', 'routes', 'deliveries', 'pods', 'vehicle_positions',
  'alerts', 'notification_log', 'settings']

// Ações de LGPD (RNF08). As RPCs recusam quem não é admin (42501) — a tela só filtra o que o banco já garante.
const ACTIONS = {
  anon_driver: { label: 'Anonimizar', verb: 'Anonimizar o motorista', run: (r) => supabase.rpc('anonymize_driver', { p: r.id }) },
  del_driver: { label: 'Excluir', verb: 'Excluir definitivamente o motorista', run: (r) => supabase.from('drivers').delete().eq('id', r.id) },
  anon_delivery: { label: 'Anonimizar', verb: 'Anonimizar o destinatário da entrega', run: anonymizeDelivery },
  del_delivery: { label: 'Excluir', verb: 'Excluir definitivamente a entrega', run: deleteDelivery },
}

// Remove as fotos/assinaturas do Storage antes de apagar as referências (bucket privado "pod").
async function removePodFiles(deliveryId) {
  const { data, error } = await supabase.from('pods').select('photo_path, signature_path').eq('delivery_id', deliveryId)
  if (error) return { error }
  const paths = (data ?? []).flatMap((p) => [p.photo_path, p.signature_path]).filter(Boolean)
  if (paths.length === 0) return {}
  return supabase.storage.from('pod').remove(paths)
}

async function anonymizeDelivery(r) {
  const files = await removePodFiles(r.id)
  if (files.error) return files
  return supabase.rpc('anonymize_delivery', { p: r.id })
}

async function deleteDelivery(r) {
  const files = await removePodFiles(r.id)
  if (files.error) return files
  return supabase.from('deliveries').delete().eq('id', r.id)
}

function download(name, obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminDados() {
  const [drivers, setDrivers] = useState(null)
  const [deliveries, setDeliveries] = useState(null)
  const [pending, setPending] = useState(null) // { action, row, name }
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => Promise.all([
    supabase.from('drivers').select('id, name, phone, consent_at, anonymized_at').order('name'),
    supabase.from('deliveries').select('id, code, recipient_name, recipient_phone, region, status, anonymized_at')
      .order('created_at', { ascending: false }).limit(500),
  ]).then(([d, e]) => {
    const error = d.error || e.error
    if (error) setMsg({ text: dbMessage(error), error: true })
    setDrivers(d.data ?? [])
    setDeliveries(e.data ?? [])
  }), [])

  useEffect(() => { load() }, [load])

  async function confirm() {
    setBusy(true)
    const { error } = await ACTIONS[pending.action].run(pending.row)
    setBusy(false)
    setMsg(error
      ? { text: dbMessage(error), error: true }
      : { text: `${ACTIONS[pending.action].verb} ${pending.name}: concluído.`, error: false })
    setPending(null)
    load()
  }

  async function retention() {
    setBusy(true)
    const { data, error } = await supabase.rpc('lgpd_retention', { p_days: 90 })
    setBusy(false)
    setMsg(error ? { text: dbMessage(error), error: true }
      : { text: `Retenção aplicada: ${data} entrega(s) finalizada(s) há mais de 90 dias anonimizada(s).`, error: false })
    setPending(null)
    load()
  }

  async function backup() {
    setBusy(true)
    const out = { exported_at: new Date().toISOString(), tables: {} }
    for (const t of TABLES) {
      // shortcut: até 10 mil linhas por tabela; acima disso use scripts/backup.mjs ou `supabase db dump`.
      const { data, error } = await supabase.from(t).select('*').limit(10000)
      out.tables[t] = error ? { error: error.message } : data
    }
    setBusy(false)
    download(`backup-senn-aix-${out.exported_at.slice(0, 10)}.json`, out)
    setMsg({ text: 'Backup gerado. Guarde o arquivo em local seguro: ele contém dados pessoais.', error: false })
  }

  const ask = (action, row, name) => setPending({ action, row, name })
  const anon = (r) => (r.anonymized_at ? <span className="badge">Anonimizado</span> : <span className="badge warn">Dados pessoais</span>)
  const btns = (r, name, a, d) => (
    <div className="row-actions">
      <button type="button" className="secondary" disabled={!!r.anonymized_at} onClick={() => ask(a, r, name)}>
        Anonimizar<span className="sr-only"> {name}</span>
      </button>
      <button type="button" className="secondary danger-text" onClick={() => ask(d, r, name)}>
        Excluir<span className="sr-only"> {name}</span>
      </button>
    </div>
  )

  const driverCols = [
    { key: 'name', label: 'Motorista' },
    { key: 'phone', label: 'Telefone' },
    { key: 'anonymized_at', label: 'Situação', render: anon, value: (r) => (r.anonymized_at ? 'anonimizado' : 'dados pessoais') },
    { key: 'acoes', label: 'Ações', sortable: false, render: (r) => btns(r, r.name, 'anon_driver', 'del_driver') },
  ]
  const deliveryCols = [
    { key: 'code', label: 'Código' },
    { key: 'recipient_name', label: 'Destinatário' },
    { key: 'recipient_phone', label: 'Telefone' },
    { key: 'status', label: 'Status' },
    { key: 'anonymized_at', label: 'Situação', render: anon, value: (r) => (r.anonymized_at ? 'anonimizado' : 'dados pessoais') },
    { key: 'acoes', label: 'Ações', sortable: false, render: (r) => btns(r, `${r.code} (${r.recipient_name})`, 'anon_delivery', 'del_delivery') },
  ]

  const isRetention = pending?.action === 'retention'

  return (
    <div className="stack">
      <div className="page-head"><h1>Dados, backup e LGPD</h1></div>
      <p className="page-desc">Gere backups e atenda pedidos de acesso, correção ou exclusão de dados pessoais.</p>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      <section className="card stack" aria-labelledby="sec-backup">
        <h2 id="sec-backup">Backup (RNF05)</h2>
        <p>Baixa um JSON com todas as tabelas visíveis ao administrador. Para backup completo use <code>node scripts/backup.mjs</code> ou <code>npx supabase db dump</code> (veja o README).</p>
        <div className="row-actions">
          <button type="button" onClick={backup} disabled={busy}>Exportar backup (JSON)</button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="sec-ret">
        <h2 id="sec-ret">Retenção de dados</h2>
        <p>Anonimiza destinatários de entregas finalizadas (entregue, falha ou cancelada) criadas há mais de 90 dias. Os KPIs continuam corretos.</p>
        <div className="row-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => ask('retention', null, '')}>Aplicar retenção (90 dias)</button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="sec-mot">
        <h2 id="sec-mot">Motoristas</h2>
        <p className="hint">Anonimizar troca o nome por “Anonimizado” e apaga telefone e consentimento, mantendo o histórico de rotas. Excluir remove o cadastro.</p>
        {drivers === null ? <p role="status">Carregando…</p> : (
          <DataTable caption="Motoristas e dados pessoais" columns={driverCols} rows={drivers} searchLabel="Buscar motorista"
            empty={<div className="empty"><p>Nenhum motorista cadastrado.</p><Link to="/motoristas">Ir para Motoristas</Link></div>} />
        )}
      </section>

      <section className="card stack" aria-labelledby="sec-dest">
        <h2 id="sec-dest">Destinatários (entregas)</h2>
        <p className="hint">Anonimizar apaga nome, telefone, endereço exato e arquivos do comprovante; mantém região, status e coordenadas aproximadas para os indicadores. Mostra as 500 entregas mais recentes.</p>
        {deliveries === null ? <p role="status">Carregando…</p> : (
          <DataTable caption="Entregas e dados de destinatários" columns={deliveryCols} rows={deliveries} searchLabel="Buscar por código ou destinatário"
            empty={<div className="empty"><p>Nenhuma entrega cadastrada.</p><Link to="/pedidos">Ir para Pedidos</Link></div>} />
        )}
      </section>

      <ConfirmDialog open={pending !== null}
        title={isRetention ? 'Aplicar a retenção de 90 dias?' : `${pending ? ACTIONS[pending.action].verb : ''} ${pending?.name ?? ''}?`}
        confirmLabel={isRetention ? 'Aplicar retenção' : pending ? ACTIONS[pending.action].label : ''}
        busy={busy} onConfirm={isRetention ? retention : confirm} onCancel={() => setPending(null)}>
        Esta ação não pode ser desfeita. Faça um backup antes se precisar guardar os dados.
      </ConfirmDialog>
    </div>
  )
}
