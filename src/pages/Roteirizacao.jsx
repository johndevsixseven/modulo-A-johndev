import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import { planRoutes, REASONS } from '../lib/routing.js'
import { ROUTE_SELECT, fromDb, fromPlan } from '../lib/routeView.js'
import { PRIORITIES, VEHICLE_TYPES, formatDate, formatTime, todayBR } from '../lib/labels.js'
import RouteStops from '../components/RouteStops.jsx'

const RouteMap = lazy(() => import('../components/RouteMap.jsx'))

// Brasília é UTC−3 fixo (sem horário de verão desde 2019).
const brt = (date, time) => `${date}T${time}:00-03:00`
const addDay = (date) => new Date(Date.parse(`${date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)
const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null

// RF05 · admin e despachante: seleciona entregas e veículos do dia, gera (local), salva e libera.
export default function Roteirizacao() {
  const [date, setDate] = useState(todayBR)
  const [deliveries, setDeliveries] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [saved, setSaved] = useState([])
  const [settings, setSettings] = useState({ depot: null, cfg: {} })
  const [selD, setSelD] = useState(new Set())
  const [selV, setSelV] = useState(new Set())
  const [plan, setPlan] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)

  // .then (e não async/await) para o oxlint ver que o setState não é síncrono no efeito.
  const load = useCallback(() => Promise.all([
      supabase.from('settings').select('key, value').in('key', ['deposito', 'roteirizacao']),
      supabase.from('deliveries')
        .select('id, code, recipient_name, address, region, lat, lng, window_start, window_end, weight_kg, volume_m3, priority')
        .eq('status', 'pendente').is('route_id', null)
        .gte('window_start', brt(date, '00:00')).lt('window_start', brt(addDay(date), '00:00'))
        .order('window_end'),
      supabase.from('vehicles')
        .select('id, plate, type, capacity_kg, capacity_m3, range_km, cost_per_km, drivers(id, name, available, cnh_expiry, anonymized_at)')
        .eq('status', 'disponivel').order('plate'),
      supabase.from('routes').select(ROUTE_SELECT).eq('route_date', date).neq('status', 'cancelada').order('created_at'),
  ]).then(([st, del, veh, rts]) => {
    const error = st.error || del.error || veh.error || rts.error
    if (error) setMsg({ text: dbMessage(error), error: true })
    const s = Object.fromEntries((st.data ?? []).map((r) => [r.key, r.value]))
    setSettings({ depot: s.deposito ?? null, cfg: s.roteirizacao ?? {} })
    // Só veículo com motorista disponível, não anonimizado e com CNH válida no dia.
    const vs = (veh.data ?? []).map((v) => ({ ...v, driver: one(v.drivers) }))
      .filter((v) => v.driver?.available && !v.driver.anonymized_at && v.driver.cnh_expiry >= date)
    const ds = del.data ?? []
    setDeliveries(ds)
    setVehicles(vs)
    setSelD(new Set(ds.map((d) => d.id)))
    setSelV(new Set(vs.map((v) => v.id)))
    setSaved(rts.data ?? [])
    setPlan(null)
  }), [date])

  useEffect(() => { load() }, [load])

  const toggle = (set, setter, id) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }

  function generate() {
    if (!settings.depot) {
      setMsg({ text: 'Depósito não configurado (settings.deposito). Peça ao administrador para cadastrá-lo.', error: true })
      return
    }
    const start = Math.max(Date.now(), Date.parse(brt(date, settings.cfg.inicio ?? '08:00')))
    const result = planRoutes({
      deliveries: deliveries.filter((d) => selD.has(d.id)),
      vehicles: vehicles.filter((v) => selV.has(v.id)),
      depot: settings.depot, config: settings.cfg, start,
    })
    setPlan(result)
    const n = result.routes.reduce((s, r) => s + r.stops.length, 0)
    setMsg({ text: `${result.routes.length} rota(s) proposta(s) com ${n} entrega(s); ${result.unassigned.length} não alocada(s). Confira e salve.`, error: false })
  }

  // Grava uma rota em rascunho, vincula as entregas e libera. Se o vínculo falhar, desfaz a rota.
  async function saveRoute(r, i) {
    const { data: route, error } = await supabase.from('routes').insert({
      name: `Rota ${formatDate(date).slice(0, 5)} · ${r.vehicle.plate}`, route_date: date,
      vehicle_id: r.vehicle.id, driver_id: r.vehicle.driver.id, status: 'rascunho',
      total_km: r.total_km, total_min: r.total_min, est_cost: r.est_cost, load_kg: r.load_kg, geometry: r.geometry,
    }).select('id').single()
    if (error) return `Rota ${i + 1}: ${dbMessage(error)}`
    const links = await Promise.all(r.stops.map((s) => supabase.from('deliveries')
      .update({ route_id: route.id, stop_order: s.order, eta: s.eta })
      .eq('id', s.delivery.id).eq('status', 'pendente').is('route_id', null).select('id')))
    if (links.some((l) => l.error || l.data.length !== 1)) {
      await supabase.from('deliveries').update({ route_id: null, stop_order: null, eta: null }).eq('route_id', route.id)
      await supabase.from('routes').delete().eq('id', route.id)
      return `Rota ${i + 1}: algum pedido mudou ou já foi roteirizado por outra pessoa. Gere as rotas de novo.`
    }
    const rel = await supabase.rpc('release_route', { p_route: route.id })
    return rel.error ? `Rota ${i + 1} salva como rascunho, mas não foi liberada: ${dbMessage(rel.error)} Use "Liberar" abaixo.` : null
  }

  async function saveAll() {
    setBusy(true)
    const errors = []
    for (const [i, r] of plan.routes.entries()) {
      const e = await saveRoute(r, i)
      if (e) errors.push(e)
    }
    setBusy(false)
    await load()
    setMsg(errors.length ? { text: errors.join(' '), error: true }
      : { text: `${plan.routes.length} rota(s) salva(s) e liberada(s). Os motoristas já podem vê-las.`, error: false })
  }

  async function release(row) {
    setBusy(true)
    const { error } = await supabase.rpc('release_route', { p_route: row.id })
    setBusy(false)
    await load()
    setMsg(error ? { text: dbMessage(error), error: true } : { text: `${row.name} liberada.`, error: false })
  }

  const proposed = plan?.routes.map(fromPlan) ?? []
  const savedViews = saved.map(fromDb)
  const depot = settings.depot

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Roteirização</h1>
        <div className="field">
          <label htmlFor="data-rota">Data das entregas</label>
          <input id="data-rota" type="date" value={date} min={todayBR()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
      </div>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      {deliveries === null ? <p role="status">Carregando…</p> : (
        <div className="grid select-grid">
          <fieldset className="card">
            <legend>Entregas pendentes ({selD.size}/{deliveries.length})</legend>
            {deliveries.length === 0 ? (
              <div className="empty"><p>Nenhuma entrega pendente sem rota nesta data.</p><Link to="/pedidos">Ver pedidos</Link></div>
            ) : (
              <ul className="check-list">
                {deliveries.map((d) => (
                  <li key={d.id}>
                    <label className="checkbox">
                      <input type="checkbox" checked={selD.has(d.id)} onChange={() => toggle(selD, setSelD, d.id)} />
                      <span>
                        <strong>{d.code}</strong> · {d.region} · {formatTime(d.window_start)}–{formatTime(d.window_end)} · {Number(d.weight_kg)} kg
                        {d.priority !== 'normal' && <> · <span className="badge">{PRIORITIES[d.priority]}</span></>}
                        {d.lat == null && <> · <span className="badge warn">Sem coordenada</span></>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <fieldset className="card">
            <legend>Veículos disponíveis com motorista ({selV.size}/{vehicles.length})</legend>
            {vehicles.length === 0 ? (
              <div className="empty"><p>Nenhum veículo disponível com motorista.</p><Link to="/veiculos">Ver veículos</Link></div>
            ) : (
              <ul className="check-list">
                {vehicles.map((v) => (
                  <li key={v.id}>
                    <label className="checkbox">
                      <input type="checkbox" checked={selV.has(v.id)} onChange={() => toggle(selV, setSelV, v.id)} />
                      <span>
                        <strong>{v.plate}</strong> · {VEHICLE_TYPES[v.type]} · {Number(v.capacity_kg)} kg / {Number(v.capacity_m3)} m³ · {Number(v.range_km)} km · {v.driver.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>
      )}

      <div className="row-actions">
        <button type="button" onClick={generate} disabled={busy || !selD.size || !selV.size}>Gerar rotas</button>
        {plan?.routes.length > 0 && (
          <button type="button" onClick={saveAll} disabled={busy}>{busy ? 'Salvando…' : `Salvar e liberar ${plan.routes.length} rota(s)`}</button>
        )}
        {plan && <button type="button" className="secondary" onClick={() => { setPlan(null); setMsg({ text: '', error: false }) }} disabled={busy}>Descartar proposta</button>}
      </div>

      {plan && (
        <section className="stack" aria-labelledby="proposta">
          <h2 id="proposta">Proposta (ainda não salva)</h2>
          {proposed.length > 0 && <Suspense fallback={<p role="status">Carregando mapa…</p>}><RouteMap routes={proposed} depot={depot} /></Suspense>}
          {proposed.map((r) => <RouteStops key={r.key} route={r} />)}
          {plan.unassigned.length > 0 && (
            <div className="card stack">
              <h3>Não alocadas ({plan.unassigned.length})</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th scope="col">Pedido</th><th scope="col">Janela</th><th scope="col">Peso</th><th scope="col">Motivo</th></tr></thead>
                  <tbody>
                    {plan.unassigned.map((u) => (
                      <tr key={u.delivery.id}>
                        <td>{u.delivery.code}</td>
                        <td>{formatTime(u.delivery.window_start)}–{formatTime(u.delivery.window_end)}</td>
                        <td>{Number(u.delivery.weight_kg)} kg</td>
                        <td>{REASONS[u.reason]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="stack" aria-labelledby="salvas">
        <h2 id="salvas">Rotas salvas em {formatDate(date)}</h2>
        {savedViews.length === 0 ? <p>Nenhuma rota salva nesta data.</p> : (
          <>
            {!plan && <Suspense fallback={<p role="status">Carregando mapa…</p>}><RouteMap routes={savedViews} depot={depot} /></Suspense>}
            {savedViews.map((r) => (
              <RouteStops key={r.key} route={r}>
                {r.status === 'rascunho' && (
                  <div><button type="button" onClick={() => release(r)} disabled={busy}>Liberar<span className="sr-only"> {r.name}</span></button></div>
                )}
              </RouteStops>
            ))}
          </>
        )}
      </section>
    </div>
  )
}
