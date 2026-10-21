import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { dbMessage } from '../lib/dbError.js'
import { ROUTE_SELECT, fromDb } from '../lib/routeView.js'
import { formatDate, todayBR } from '../lib/labels.js'
import RouteStops from '../components/RouteStops.jsx'
import EntregaPod from '../components/EntregaPod.jsx'
import { trackPoints } from '../lib/track.js'

const RouteMap = lazy(() => import('../components/RouteMap.jsx'))

// RF05 · Minha rota: o RLS só devolve as rotas do motorista logado (admin vê todas, para teste).
export default function MotoristaHome() {
  const { profile } = useAuth()
  const [routes, setRoutes] = useState(null)
  const [selected, setSelected] = useState('')
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const today = todayBR()

  const load = useCallback(() => supabase.from('routes').select(ROUTE_SELECT)
    .eq('route_date', today).in('status', ['liberada', 'em_andamento', 'concluida']).order('created_at')
    .then(({ data, error }) => {
      if (error) setMsg({ text: dbMessage(error), error: true })
      setRoutes(data ?? [])
    }), [today])

  useEffect(() => { load() }, [load])

  const views = (routes ?? []).map(fromDb)
  const route = views.find((r) => r.id === selected) ?? views[0]

  // RF06 · envio de posição: GPS real (a cada 10 s) ou simulação ao longo da rota (a cada 3 s, para a demonstração).
  const [tracking, setTracking] = useState('')
  const stopTrack = useRef(null)
  useEffect(() => () => stopTrack.current?.(), [])
  const sendPos = (lat, lng) => supabase.from('vehicle_positions')
    .insert({ vehicle_id: route.vehicle_id, route_id: route.id, lat, lng })
    .then(({ error }) => error && setMsg({ text: dbMessage(error), error: true }))

  function toggleTrack(kind) {
    stopTrack.current?.()
    stopTrack.current = null
    if (tracking === kind) return setTracking('')
    if (kind === 'gps') {
      if (!navigator.geolocation) return setMsg({ text: 'Este aparelho não oferece localização. Use a simulação.', error: true })
      let last = 0
      const w = navigator.geolocation.watchPosition((p) => {
        if (Date.now() - last < 10000) return
        last = Date.now()
        sendPos(p.coords.latitude, p.coords.longitude)
      }, () => setMsg({ text: 'Localização negada ou indisponível. Use a simulação.', error: true }), { enableHighAccuracy: true })
      stopTrack.current = () => navigator.geolocation.clearWatch(w)
    } else {
      const pts = trackPoints(route.geometry, 60)
      let i = 0
      const tick = () => { sendPos(...pts[i]); i = Math.min(i + 1, pts.length - 1) }
      tick()
      const t = setInterval(tick, 3000)
      stopTrack.current = () => clearInterval(t)
    }
    setTracking(kind)
  }

  async function start() {
    setBusy(true)
    const { error } = await supabase.rpc('start_route', { p_route: route.id })
    setBusy(false)
    setMsg(error ? { text: dbMessage(error), error: true } : { text: 'Rota iniciada. Boa viagem!', error: false })
    load()
  }

  return (
    <div className="stack">
      <h1>Minha rota · {formatDate(today)}</h1>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>
      {routes === null ? <p role="status">Carregando…</p> : !route ? (
        <div className="card empty">
          <p>Nenhuma rota liberada para você hoje.</p>
          <button type="button" className="secondary" onClick={load}>Verificar de novo</button>
        </div>
      ) : (
        <>
          {profile.role === 'admin' && views.length > 1 && (
            <div className="field search">
              <label htmlFor="rota-sel">Rota</label>
              <select id="rota-sel" value={route.id} onChange={(e) => setSelected(e.target.value)}>
                {views.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <Suspense fallback={<p role="status">Carregando mapa…</p>}><RouteMap routes={[route]} /></Suspense>
          <RouteStops route={route} headingLevel={2}
            stopExtra={route.status === 'em_andamento' ? (s) => <EntregaPod stop={s} driverId={route.driver_id} onDone={load} /> : undefined}>
            {route.status === 'liberada' && (
              <div><button type="button" onClick={start} disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar rota'}</button></div>
            )}
            {route.status === 'em_andamento' && (
              <div className="row-actions">
                <button type="button" className={tracking === 'gps' ? '' : 'secondary'} aria-pressed={tracking === 'gps'}
                  onClick={() => toggleTrack('gps')}>{tracking === 'gps' ? 'Parar envio da localização' : 'Enviar minha localização'}</button>
                <button type="button" className={tracking === 'sim' ? '' : 'secondary'} aria-pressed={tracking === 'sim'}
                  onClick={() => toggleTrack('sim')}>{tracking === 'sim' ? 'Parar simulação' : 'Simular deslocamento'}</button>
              </div>
            )}
          </RouteStops>
        </>
      )}
    </div>
  )
}
