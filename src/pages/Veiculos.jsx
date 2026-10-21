import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { useForm } from '../lib/useForm.js'
import { toNumber } from '../lib/csv.js'
import { dbMessage } from '../lib/dbError.js'
import { VEHICLE_STATUS, VEHICLE_TYPES, daysUntil, formatDate } from '../lib/labels.js'
import Field from '../components/Field.jsx'
import DataTable from '../components/DataTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

// Mesmo padrão do check em public.vehicles: antiga (ABC1234) e Mercosul (ABC1D23).
const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const normPlate = (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, '')

const EMPTY = { plate: '', type: 'van', capacity_kg: '', capacity_m3: '', range_km: '', cost_per_km: '1.50',
  status: 'disponivel', next_maintenance: '' }

function validate(v) {
  const e = {}
  if (!v.plate.trim()) e.plate = 'Informe a placa.'
  else if (!PLATE_RE.test(normPlate(v.plate))) e.plate = 'Use o formato ABC1234 (antigo) ou ABC1D23 (Mercosul).'
  if (!(toNumber(v.capacity_kg) > 0)) e.capacity_kg = 'Informe uma capacidade maior que zero (kg).'
  if (!(toNumber(v.capacity_m3) > 0)) e.capacity_m3 = 'Informe uma capacidade maior que zero (m³).'
  if (!(toNumber(v.range_km) > 0)) e.range_km = 'Informe uma autonomia maior que zero (km).'
  if (!(toNumber(v.cost_per_km) >= 0)) e.cost_per_km = 'Informe o custo por km (zero ou mais).'
  return e
}

// Destaque visual de manutenção próxima (alertas de verdade na Fase 8). shortcut: 7 dias fixo, ler settings.alertas na Fase 8.
function Maintenance({ date }) {
  if (!date) return '—'
  const d = daysUntil(date)
  if (d < 0) return <>{formatDate(date)} <span className="badge danger">Vencida</span></>
  if (d <= 7) return <>{formatDate(date)} <span className="badge warn">Em {d} dia(s)</span></>
  return formatDate(date)
}

export default function Veiculos() {
  const { profile } = useAuth()
  const canWrite = ['admin', 'gestor_frota'].includes(profile.role)
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // null = fechado · 'new' · id
  const [toDelete, setToDelete] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const form = useForm(EMPTY, validate)

  const load = useCallback(() => supabase.from('vehicles')
    .select('id, plate, type, capacity_kg, capacity_m3, range_km, cost_per_km, status, next_maintenance')
    .order('plate')
    .then(({ data, error }) => {
      if (error) setMsg({ text: dbMessage(error), error: true })
      setRows(data ?? [])
    }), [])

  useEffect(() => { load() }, [load])

  function open(row) {
    setMsg({ text: '', error: false })
    setEditing(row ? row.id : 'new')
    form.reset(row ? { ...row, next_maintenance: row.next_maintenance ?? '',
      capacity_kg: String(row.capacity_kg), capacity_m3: String(row.capacity_m3),
      range_km: String(row.range_km), cost_per_km: String(row.cost_per_km) } : EMPTY)
  }

  async function save(e) {
    e.preventDefault()
    if (!form.valid) { form.touchAll(); return }
    const v = form.values
    const row = {
      plate: normPlate(v.plate), type: v.type, status: v.status,
      capacity_kg: toNumber(v.capacity_kg), capacity_m3: toNumber(v.capacity_m3),
      range_km: toNumber(v.range_km), cost_per_km: toNumber(v.cost_per_km),
      next_maintenance: v.next_maintenance || null,
    }
    setBusy(true)
    const { error } = editing === 'new'
      ? await supabase.from('vehicles').insert(row)
      : await supabase.from('vehicles').update(row).eq('id', editing)
    setBusy(false)
    if (error) {
      setMsg({ text: dbMessage(error, `A placa ${row.plate} já está cadastrada. Confira a placa ou edite o veículo existente.`), error: true })
      return
    }
    setMsg({ text: `Veículo ${row.plate} ${editing === 'new' ? 'cadastrado' : 'atualizado'}.`, error: false })
    setEditing(null)
    load()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('vehicles').delete().eq('id', toDelete.id)
    setBusy(false)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `Veículo ${toDelete.plate} excluído.`, error: false })
    setToDelete(null)
    if (!error) { if (editing === toDelete.id) setEditing(null); load() }
  }

  const columns = [
    { key: 'plate', label: 'Placa' },
    { key: 'type', label: 'Tipo', value: (r) => VEHICLE_TYPES[r.type] },
    { key: 'capacity_kg', label: 'Capacidade (kg)', value: (r) => Number(r.capacity_kg) },
    { key: 'capacity_m3', label: 'Capacidade (m³)', value: (r) => Number(r.capacity_m3) },
    { key: 'range_km', label: 'Autonomia (km)', value: (r) => Number(r.range_km) },
    { key: 'cost_per_km', label: 'Custo/km (R$)', value: (r) => Number(r.cost_per_km) },
    { key: 'status', label: 'Status', value: (r) => VEHICLE_STATUS[r.status] },
    { key: 'next_maintenance', label: 'Próx. manutenção', render: (r) => <Maintenance date={r.next_maintenance} /> },
    ...(canWrite ? [{ key: 'acoes', label: 'Ações', sortable: false, value: () => '', render: (r) => (
      <div className="row-actions">
        <button type="button" className="secondary" onClick={() => open(r)}>Editar<span className="sr-only"> {r.plate}</span></button>
        <button type="button" className="secondary danger-text" onClick={() => setToDelete(r)}>Excluir<span className="sr-only"> {r.plate}</span></button>
      </div>
    ) }] : []),
  ]

  const f = form.field
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Veículos</h1>
        {canWrite && editing === null && <button type="button" onClick={() => open(null)}>Cadastrar veículo</button>}
      </div>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      {editing !== null && (
        <form className="card stack" onSubmit={save} noValidate>
          <h2>{editing === 'new' ? 'Novo veículo' : `Editar veículo ${form.values.plate}`}</h2>
          <div className="grid">
            <Field name="plate" label="Placa" hint="(ex.: ABC1D23)" error={form.shown('plate')}>
              <input {...f('plate')} autoCapitalize="characters" maxLength={8} />
            </Field>
            <Field name="type" label="Tipo">
              <select {...f('type')}>
                {Object.entries(VEHICLE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field name="capacity_kg" label="Capacidade (kg)" error={form.shown('capacity_kg')}>
              <input {...f('capacity_kg')} inputMode="decimal" />
            </Field>
            <Field name="capacity_m3" label="Capacidade (m³)" error={form.shown('capacity_m3')}>
              <input {...f('capacity_m3')} inputMode="decimal" />
            </Field>
            <Field name="range_km" label="Autonomia (km)" error={form.shown('range_km')}>
              <input {...f('range_km')} inputMode="decimal" />
            </Field>
            <Field name="cost_per_km" label="Custo por km (R$)" error={form.shown('cost_per_km')}>
              <input {...f('cost_per_km')} inputMode="decimal" />
            </Field>
            <Field name="status" label="Status">
              <select {...f('status')}>
                {Object.entries(VEHICLE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field name="next_maintenance" label="Próxima manutenção" hint="(opcional)">
              <input {...f('next_maintenance')} type="date" />
            </Field>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={busy}>{editing === 'new' ? 'Cadastrar veículo' : 'Salvar alterações'}</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="card stack" aria-labelledby="lista-veiculos">
        <h2 id="lista-veiculos">Frota</h2>
        {rows === null ? <p role="status">Carregando…</p> : (
          <DataTable caption="Veículos" columns={columns} rows={rows} searchLabel="Buscar por placa, tipo ou status"
            empty={(
              <div className="empty">
                <p>Nenhum veículo cadastrado ainda.</p>
                {canWrite && <button type="button" onClick={() => open(null)}>Cadastrar o primeiro veículo</button>}
              </div>
            )} />
        )}
      </section>

      <ConfirmDialog open={toDelete !== null} title={`Excluir o veículo ${toDelete?.plate ?? ''}?`}
        confirmLabel={`Excluir ${toDelete?.plate ?? ''}`} busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)}>
        O veículo sai da frota e o motorista vinculado fica sem veículo. Rotas antigas continuam no histórico. Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  )
}
