import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { useForm } from '../lib/useForm.js'
import { digits } from '../lib/csv.js'
import { dbMessage } from '../lib/dbError.js'
import { CNH_CATEGORIES, VEHICLE_STATUS, VEHICLE_TYPES, daysUntil, formatDate, todayBR } from '../lib/labels.js'
import Field from '../components/Field.jsx'
import DataTable from '../components/DataTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const DEFAULT_PURPOSE = 'Gestão da frota e rastreamento durante a jornada de trabalho'
const EMPTY = { name: '', cnh_category: 'B', cnh_expiry: '', phone: '', vehicle_id: '', available: true,
  consent: false, consent_purpose: DEFAULT_PURPOSE }

function validate(v) {
  const e = {}
  if (!v.name.trim()) e.name = 'Informe o nome do motorista.'
  if (!v.cnh_expiry) e.cnh_expiry = 'Informe a validade da CNH.'
  else if (v.cnh_expiry < todayBR()) e.cnh_expiry = 'Esta CNH já venceu. Informe a validade da CNH renovada.'
  const p = digits(v.phone)
  if (v.phone.trim() && (p.length < 10 || p.length > 13)) e.phone = 'Use DDD + número, só dígitos (ex.: 11988887777).'
  if (v.consent && !v.consent_purpose.trim()) e.consent_purpose = 'Informe a finalidade do uso dos dados.'
  return e
}

// Destaque de CNH a vencer (alertas de verdade na Fase 8). shortcut: 30 dias fixo, ler settings.alertas na Fase 8.
function Cnh({ date }) {
  const d = daysUntil(date)
  if (d < 0) return <>{formatDate(date)} <span className="badge danger">Vencida</span></>
  if (d <= 30) return <>{formatDate(date)} <span className="badge warn">Vence em {d} dia(s)</span></>
  return formatDate(date)
}

export default function Motoristas() {
  const { profile } = useAuth()
  const canWrite = ['admin', 'gestor_frota'].includes(profile.role)
  const [rows, setRows] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const form = useForm(EMPTY, validate)

  const load = useCallback(() => Promise.all([
    supabase.from('drivers')
      .select('id, name, cnh_category, cnh_expiry, phone, available, vehicle_id, consent_at, consent_purpose, vehicles(plate)')
      .order('name'),
    supabase.from('vehicles').select('id, plate, type, status').order('plate'),
  ]).then(([d, v]) => {
    const error = d.error || v.error
    if (error) setMsg({ text: dbMessage(error), error: true })
    setRows(d.data ?? [])
    setVehicles(v.data ?? [])
  }), [])

  useEffect(() => { load() }, [load])

  function open(row) {
    setMsg({ text: '', error: false })
    setEditing(row ? row.id : 'new')
    form.reset(row ? {
      name: row.name, cnh_category: row.cnh_category, cnh_expiry: row.cnh_expiry, phone: row.phone ?? '',
      vehicle_id: row.vehicle_id ?? '', available: row.available, consent: Boolean(row.consent_at),
      consent_purpose: row.consent_purpose ?? DEFAULT_PURPOSE,
    } : EMPTY)
  }

  async function save(e) {
    e.preventDefault()
    if (!form.valid) { form.touchAll(); return }
    const v = form.values
    const current = rows.find((r) => r.id === editing)
    const row = {
      name: v.name.trim(), cnh_category: v.cnh_category, cnh_expiry: v.cnh_expiry,
      phone: digits(v.phone) || null, vehicle_id: v.vehicle_id || null, available: v.available,
      // Mantém a data original do consentimento; registra agora se é novo.
      consent_at: v.consent ? (current?.consent_at ?? new Date().toISOString()) : null,
      consent_purpose: v.consent ? v.consent_purpose.trim() : null,
    }
    setBusy(true)
    const { error } = editing === 'new'
      ? await supabase.from('drivers').insert(row)
      : await supabase.from('drivers').update(row).eq('id', editing)
    setBusy(false)
    if (error) {
      setMsg({ text: dbMessage(error, 'Este veículo já está vinculado a outro motorista. Escolha outro veículo ou desvincule-o primeiro.'), error: true })
      return
    }
    setMsg({ text: `Motorista ${row.name} ${editing === 'new' ? 'cadastrado' : 'atualizado'}.`, error: false })
    setEditing(null)
    load()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('drivers').delete().eq('id', toDelete.id)
    setBusy(false)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `Motorista ${toDelete.name} excluído.`, error: false })
    setToDelete(null)
    if (!error) { if (editing === toDelete.id) setEditing(null); load() }
  }

  // Vínculo 1:1 (unique no banco): só oferece veículos livres ou o do próprio motorista.
  const taken = new Set((rows ?? []).filter((r) => r.id !== editing && r.vehicle_id).map((r) => r.vehicle_id))
  const freeVehicles = vehicles.filter((v) => !taken.has(v.id))

  const columns = [
    { key: 'name', label: 'Nome' },
    { key: 'cnh_category', label: 'CNH' },
    { key: 'cnh_expiry', label: 'Validade CNH', render: (r) => <Cnh date={r.cnh_expiry} /> },
    { key: 'phone', label: 'Telefone' },
    { key: 'vehicle', label: 'Veículo', value: (r) => r.vehicles?.plate ?? '' , render: (r) => r.vehicles?.plate ?? 'Sem veículo' },
    { key: 'available', label: 'Disponível', value: (r) => (r.available ? 'Sim' : 'Não') },
    { key: 'consent', label: 'Consentimento LGPD', value: (r) => (r.consent_at ? 'Sim' : 'Não') },
    ...(canWrite ? [{ key: 'acoes', label: 'Ações', sortable: false, value: () => '', render: (r) => (
      <div className="row-actions">
        <button type="button" className="secondary" onClick={() => open(r)}>Editar<span className="sr-only"> {r.name}</span></button>
        <button type="button" className="secondary danger-text" onClick={() => setToDelete(r)}>Excluir<span className="sr-only"> {r.name}</span></button>
      </div>
    ) }] : []),
  ]

  const f = form.field
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Motoristas</h1>
        {canWrite && editing === null && <button type="button" onClick={() => open(null)}>Cadastrar motorista</button>}
      </div>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      {editing !== null && (
        <form className="card stack" onSubmit={save} noValidate>
          <h2>{editing === 'new' ? 'Novo motorista' : `Editar ${form.values.name}`}</h2>
          <div className="grid">
            <Field name="name" label="Nome completo" error={form.shown('name')}>
              <input {...f('name')} autoComplete="off" />
            </Field>
            <Field name="cnh_category" label="Categoria da CNH">
              <select {...f('cnh_category')}>
                {CNH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field name="cnh_expiry" label="Validade da CNH" error={form.shown('cnh_expiry')}>
              <input {...f('cnh_expiry')} type="date" />
            </Field>
            <Field name="phone" label="Telefone" hint="(opcional, com DDD)" error={form.shown('phone')}>
              <input {...f('phone')} type="tel" inputMode="tel" />
            </Field>
            <Field name="vehicle_id" label="Veículo">
              <select {...f('vehicle_id')}>
                <option value="">Sem veículo</option>
                {freeVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} · {VEHICLE_TYPES[v.type]}{v.status !== 'disponivel' ? ` (${VEHICLE_STATUS[v.status]})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="checkbox"><input type="checkbox" {...f('available')} /> Disponível para rotas</label>
          <fieldset className="stack">
            <legend>Dados pessoais (LGPD)</legend>
            <label className="checkbox">
              <input type="checkbox" {...f('consent')} /> O motorista consentiu com o uso dos dados para a finalidade abaixo
            </label>
            {form.values.consent && (
              <Field name="consent_purpose" label="Finalidade" error={form.shown('consent_purpose')}>
                <input {...f('consent_purpose')} />
              </Field>
            )}
          </fieldset>
          <div className="row-actions">
            <button type="submit" disabled={busy}>{editing === 'new' ? 'Cadastrar motorista' : 'Salvar alterações'}</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="card stack" aria-labelledby="lista-motoristas">
        <h2 id="lista-motoristas">Cadastrados</h2>
        {rows === null ? <p role="status">Carregando…</p> : (
          <DataTable caption="Motoristas" columns={columns} rows={rows} searchLabel="Buscar por nome, CNH ou placa"
            empty={(
              <div className="empty">
                <p>Nenhum motorista cadastrado ainda.</p>
                {canWrite && <button type="button" onClick={() => open(null)}>Cadastrar o primeiro motorista</button>}
              </div>
            )} />
        )}
      </section>

      <ConfirmDialog open={toDelete !== null} title={`Excluir o motorista ${toDelete?.name ?? ''}?`}
        confirmLabel={`Excluir ${toDelete?.name ?? ''}`} busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)}>
        O cadastro e o vínculo com o veículo são removidos. Rotas antigas continuam no histórico sem o nome. Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  )
}
