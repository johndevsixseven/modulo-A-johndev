import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { useForm } from '../lib/useForm.js'
import { DEFAULT_PURPOSE, validateDelivery } from '../lib/csv.js'
import { geocode, geocodeEnabled } from '../lib/geocode.js'
import { dbMessage } from '../lib/dbError.js'
import { DELIVERY_STATUS, PRIORITIES, REGIONS, formatDateTime, isoToLocalInput } from '../lib/labels.js'
import Field from '../components/Field.jsx'
import DataTable from '../components/DataTable.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ImportarPedidos from '../components/ImportarPedidos.jsx'

const EMPTY = { code: '', recipient_name: '', recipient_phone: '', address: '', region: '', lat: '', lng: '',
  window_start: '', window_end: '', weight_kg: '', volume_m3: '', priority: 'normal', consent: false,
  purpose: DEFAULT_PURPOSE }

const validate = (v) => validateDelivery(v).errors

// shortcut: até 500 pedidos por status na tela; paginação com range() na Fase 10 (RNF02).
const LIMIT = 500

export default function Pedidos() {
  const { profile } = useAuth()
  const canWrite = ['admin', 'despachante'].includes(profile.role)
  const [status, setStatus] = useState('pendente')
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [geoMsg, setGeoMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const form = useForm(EMPTY, validate)

  const load = useCallback(() => {
    let q = supabase.from('deliveries')
      .select('id, code, recipient_name, recipient_phone, address, region, lat, lng, window_start, window_end, weight_kg, volume_m3, priority, status, consent, purpose')
      .order('window_start', { ascending: false }).limit(LIMIT)
    if (status) q = q.eq('status', status)
    return q.then(({ data, error }) => {
      if (error) setMsg({ text: dbMessage(error), error: true })
      setRows(data ?? [])
    })
  }, [status])

  useEffect(() => { load() }, [load])

  function open(row) {
    setMsg({ text: '', error: false })
    setGeoMsg('')
    setEditing(row ? row.id : 'new')
    form.reset(row ? {
      ...row, recipient_phone: row.recipient_phone ?? '',
      lat: row.lat == null ? '' : String(row.lat), lng: row.lng == null ? '' : String(row.lng),
      window_start: isoToLocalInput(row.window_start), window_end: isoToLocalInput(row.window_end),
      weight_kg: String(row.weight_kg), volume_m3: String(row.volume_m3),
    } : EMPTY)
  }

  async function locate() {
    const address = form.values.address.trim()
    if (!address) { setGeoMsg('Preencha o endereço antes de localizar.'); return }
    setGeoMsg('Localizando endereço…')
    try {
      const hit = await geocode(address)
      if (!hit) { setGeoMsg('Não encontramos este endereço. Confira rua, número e cidade, ou digite latitude e longitude.'); return }
      form.setValues((v) => ({ ...v, lat: hit.lat.toFixed(6), lng: hit.lng.toFixed(6) }))
      setGeoMsg(`Endereço localizado: ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}. Confira antes de salvar.`)
    } catch {
      setGeoMsg('O serviço de localização não respondeu. Digite latitude e longitude manualmente (ex.: -23.5640 e -46.6527).')
    }
  }

  async function save(e) {
    e.preventDefault()
    if (!form.valid) { form.touchAll(); return }
    const { row } = validateDelivery(form.values)
    setBusy(true)
    const { error } = editing === 'new'
      ? await supabase.from('deliveries').insert(row)
      : await supabase.from('deliveries').update(row).eq('id', editing)
    setBusy(false)
    if (error) {
      setMsg({ text: dbMessage(error, `O código ${row.code} já está em uso. Use outro código ou edite o pedido existente.`), error: true })
      return
    }
    setMsg({
      text: `Pedido ${row.code} ${editing === 'new' ? 'cadastrado' : 'atualizado'}.`
        + (row.lat == null ? ' Ele está sem coordenada e só entra na roteirização depois de localizado.' : ''),
      error: false,
    })
    setEditing(null)
    load()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('deliveries').delete().eq('id', toDelete.id)
    setBusy(false)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `Pedido ${toDelete.code} excluído.`, error: false })
    setToDelete(null)
    if (!error) { if (editing === toDelete.id) setEditing(null); load() }
  }

  const columns = [
    { key: 'code', label: 'Código' },
    { key: 'recipient_name', label: 'Destinatário' },
    { key: 'region', label: 'Região' },
    { key: 'window_start', label: 'Janela', render: (r) => `${formatDateTime(r.window_start)} – ${formatDateTime(r.window_end)}` },
    { key: 'weight_kg', label: 'Peso (kg)', num: true, value: (r) => Number(r.weight_kg) },
    { key: 'volume_m3', label: 'Volume (m³)', num: true, value: (r) => Number(r.volume_m3) },
    { key: 'priority', label: 'Prioridade', value: (r) => PRIORITIES[r.priority] },
    { key: 'status', label: 'Status', value: (r) => DELIVERY_STATUS[r.status] },
    { key: 'coords', label: 'Coordenada', value: (r) => (r.lat == null ? 'Sem coordenada' : 'OK'),
      render: (r) => (r.lat == null ? <span className="badge warn">Sem coordenada</span> : 'OK') },
    ...(canWrite ? [{ key: 'acoes', label: 'Ações', sortable: false, value: () => '', render: (r) => (
      // Só pedidos pendentes mudam aqui; depois de roteirizados, o ciclo segue pela roteirização/POD.
      r.status !== 'pendente' ? '—' : (
        <div className="row-actions">
          <button type="button" className="secondary" onClick={() => open(r)}>Editar<span className="sr-only"> {r.code}</span></button>
          <button type="button" className="secondary danger-text" onClick={() => setToDelete(r)}>Excluir<span className="sr-only"> {r.code}</span></button>
        </div>
      )
    ) }] : []),
  ]

  const f = form.field
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Pedidos</h1>
        {canWrite && editing === null && <button type="button" onClick={() => open(null)}>Cadastrar pedido</button>}
      </div>
      <p className="page-desc">Pedidos de entrega com destinatário, janela de horário, peso e volume.</p>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      {editing !== null && (
        <form className="card stack" onSubmit={save} noValidate>
          <h2>{editing === 'new' ? 'Novo pedido' : `Editar pedido ${form.values.code}`}</h2>
          <div className="grid">
            <Field name="code" label="Código" hint="(ex.: PED-1001)" error={form.shown('code')}>
              <input {...f('code')} autoComplete="off" />
            </Field>
            <Field name="recipient_name" label="Destinatário" error={form.shown('recipient_name')}>
              <input {...f('recipient_name')} autoComplete="off" />
            </Field>
            <Field name="recipient_phone" label="Telefone" hint="(opcional, com DDD)" error={form.shown('recipient_phone')}>
              <input {...f('recipient_phone')} type="tel" inputMode="tel" autoComplete="off" />
            </Field>
            <Field name="region" label="Região" error={form.shown('region')}>
              <input {...f('region')} list="regioes" />
            </Field>
          </div>
          <datalist id="regioes">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>

          <fieldset className="stack">
            <legend>Endereço e localização</legend>
            <Field name="address" label="Endereço" hint="(rua, número, bairro, cidade)" error={form.shown('address')}>
              <input {...f('address')} autoComplete="off" />
            </Field>
            <div className="row-actions">
              <button type="button" className="secondary" onClick={locate} disabled={!geocodeEnabled}>Localizar endereço</button>
              <p className="hint" role="status" aria-live="polite">
                {geocodeEnabled ? geoMsg : 'Localização automática desligada (VITE_ENABLE_MAPS=false). Digite latitude e longitude.'}
              </p>
            </div>
            <div className="grid">
              <Field name="lat" label="Latitude" hint="(ex.: -23.5640)" error={form.shown('lat')}>
                <input {...f('lat')} inputMode="decimal" />
              </Field>
              <Field name="lng" label="Longitude" hint="(ex.: -46.6527)" error={form.shown('lng')}>
                <input {...f('lng')} inputMode="decimal" />
              </Field>
            </div>
          </fieldset>

          <div className="grid">
            <Field name="window_start" label="Janela: início" error={form.shown('window_start')}>
              <input {...f('window_start')} type="datetime-local" />
            </Field>
            <Field name="window_end" label="Janela: fim" error={form.shown('window_end')}>
              <input {...f('window_end')} type="datetime-local" />
            </Field>
            <Field name="weight_kg" label="Peso (kg)" error={form.shown('weight_kg')}>
              <input {...f('weight_kg')} inputMode="decimal" />
            </Field>
            <Field name="volume_m3" label="Volume (m³)" error={form.shown('volume_m3')}>
              <input {...f('volume_m3')} inputMode="decimal" />
            </Field>
            <Field name="priority" label="Prioridade">
              <select {...f('priority')}>
                {Object.entries(PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          </div>

          <fieldset className="stack">
            <legend>Dados do destinatário (LGPD)</legend>
            <label className="checkbox">
              <input type="checkbox" {...f('consent')} /> O destinatário consentiu com o uso dos dados para a finalidade abaixo
            </label>
            <Field name="purpose" label="Finalidade">
              <input {...f('purpose')} />
            </Field>
          </fieldset>

          <div className="row-actions">
            <button type="submit" disabled={busy}>{editing === 'new' ? 'Cadastrar pedido' : 'Salvar alterações'}</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {canWrite && editing === null && <ImportarPedidos onImported={load} />}

      <section className="card stack" aria-labelledby="lista-pedidos">
        <h2 id="lista-pedidos">Lista de pedidos</h2>
        <div className="field search">
          <label htmlFor="filtro-status">Status</label>
          <select id="filtro-status" value={status} onChange={(e) => { setRows(null); setStatus(e.target.value) }}>
            {Object.entries(DELIVERY_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="">Todos (últimos {LIMIT})</option>
          </select>
        </div>
        {rows === null ? <p role="status">Carregando…</p> : (
          <DataTable caption="Pedidos" columns={columns} rows={rows} searchLabel="Buscar por código, destinatário ou região"
            empty={(
              <div className="empty">
                <p>Nenhum pedido com status “{DELIVERY_STATUS[status] ?? 'qualquer'}”.</p>
                {canWrite && status === 'pendente' && <button type="button" onClick={() => open(null)}>Cadastrar pedido</button>}
                {status !== '' && <button type="button" className="secondary" onClick={() => { setRows(null); setStatus('') }}>Ver todos os status</button>}
              </div>
            )} />
        )}
      </section>

      <ConfirmDialog open={toDelete !== null} title={`Excluir o pedido ${toDelete?.code ?? ''}?`}
        confirmLabel={`Excluir ${toDelete?.code ?? ''}`} busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)}>
        O pedido de {toDelete?.recipient_name} sai da lista de entregas. Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  )
}
