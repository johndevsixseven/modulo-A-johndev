import { lazy, Suspense, useCallback, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import { ROUTE_SELECT, fromDb } from '../lib/routeView.js'
import { DELIVERY_STATUS, REGIONS, formatDate, formatTime, todayBR } from '../lib/labels.js'
import { STATUS_COLORS } from '../lib/track.js'
import { useLive } from '../lib/live.js'
import { env } from '../lib/env.js'
import RouteStops from '../components/RouteStops.jsx'

const RouteMap = lazy(() => import('../components/RouteMap.jsx'))
const LEGEND = ['a_caminho', 'entregue', 'falha', 'planejada']

// RF06 · Rastreamento: veículos (última posição) e paradas por status, ao vivo (Realtime → polling).
export default function Rastreamento() {
  const [rows, setRows] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [error, setError] = useState('')
  const [f, setF] = useState({ route: '', driver: '', region: '' })
  const today = todayBR()

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('routes').select(ROUTE_SELECT)
      .eq('route_date', today).in('status', ['liberada', 'em_andamento', 'concluida']).order('created_at')
    if (e) { setError(dbMessage(e)); return }
    setError('')
    setRows(data)
    const ids = [...new Set(data.map((r) => r.vehicle_id).filter(Boolean))]
    if (!ids.length) { setVehicles([]); return }
    const { data: vs } = await supabase.from('vehicles').select('id, plate, last_lat, last_lng, last_seen_at')
      .in('id', ids).not('last_lat', 'is', null)
    setVehicles((vs ?? []).map((v) => ({ id: v.id, plate: v.plate, lat: v.last_lat, lng: v.last_lng, seen: v.last_seen_at })))
  }, [today])

  const mode = useLive(['vehicle_positions', 'deliveries', 'routes'], load)

  const all = (rows ?? []).map(fromDb)
  const drivers = [...new Set(all.map((r) => r.driver).filter(Boolean))].sort()
  const views = all
    .filter((r) => (!f.route || r.id === f.route) && (!f.driver || r.driver === f.driver))
    .map((r) => (f.region ? { ...r, stops: r.stops.filter((s) => s.region === f.region) } : r))
    .filter((r) => !f.region || r.stops.length)
  const shownVehicles = vehicles.filter((v) => views.some((r) => r.vehicle_id === v.id))
  const routeOf = (v) => views.find((r) => r.vehicle_id === v.id)
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Rastreamento em {formatDate(today)}</h1>
        <span className={`badge ${mode === 'realtime' ? 'ok' : 'warn'}`} role="status">
          {mode === 'realtime' ? 'Tempo real' : mode === 'polling' ? `Atualização a cada ${Math.round(env.pollingMs / 1000)} s` : 'Conectando…'}
        </span>
      </div>
      <p className="page-desc">Posição dos veículos e andamento das paradas das rotas liberadas hoje.</p>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="card filters" role="search" aria-label="Filtros do rastreamento">
        <div className="field">
          <label htmlFor="f-rota">Rota</label>
          <select id="f-rota" value={f.route} onChange={set('route')}>
            <option value="">Todas</option>
            {all.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-mot">Motorista</label>
          <select id="f-mot" value={f.driver} onChange={set('driver')}>
            <option value="">Todos</option>
            {drivers.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-reg">Região</label>
          <select id="f-reg" value={f.region} onChange={set('region')}>
            <option value="">Todas</option>
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <ul className="legend" aria-label="Legenda do mapa">
        {LEGEND.map((s) => (
          <li key={s}><span className="swatch" style={{ background: STATUS_COLORS[s] }} aria-hidden="true" /> {DELIVERY_STATUS[s]}</li>
        ))}
        <li><span className="swatch" style={{ background: '#1f2a37' }} aria-hidden="true" /> Veículo (placa e hora)</li>
      </ul>

      {rows === null ? <p role="status">Carregando…</p> : !views.length ? (
        <p className="card empty">Nenhuma rota liberada hoje para esses filtros.</p>
      ) : (
        <>
          <Suspense fallback={<p role="status">Carregando mapa…</p>}>
            <RouteMap routes={views} vehicles={shownVehicles} byStatus />
          </Suspense>
          <section className="card stack" aria-labelledby="veic-h">
            <h2 id="veic-h">Veículos</h2>
            {!shownVehicles.length ? <p className="hint">Nenhuma posição recebida ainda.</p> : (
              <div className="table-wrap"><table>
                <thead><tr><th scope="col">Placa</th><th scope="col">Rota</th><th scope="col">Motorista</th><th scope="col">Última posição</th><th scope="col">Hora</th></tr></thead>
                <tbody>
                  {shownVehicles.map((v) => (
                    <tr key={v.id}>
                      <td>{v.plate}</td><td>{routeOf(v)?.name}</td><td>{routeOf(v)?.driver ?? '—'}</td>
                      <td>{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</td><td>{formatTime(v.seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
          {views.map((r) => <RouteStops key={r.id} route={r} headingLevel={2} />)}
        </>
      )}
    </div>
  )
}
