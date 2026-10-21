import { DELIVERY_STATUS, ROUTE_STATUS, formatTime } from '../lib/labels.js'

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (n, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d })
const osm = (s) => `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`

// Lista ordenada de paradas: forma principal (e acessível) de ver a rota; o mapa é complemento (RNF03/RNF06).
export default function RouteStops({ route, headingLevel = 3, children }) {
  const H = `h${headingLevel}`
  const hid = `rota-${route.key}`
  return (
    <section className="card stack route-card" aria-labelledby={hid}>
      <div className="page-head">
        <H id={hid} className="route-title">
          <span className="swatch" style={{ background: route.color }} aria-hidden="true" />
          {route.name}
        </H>
        {route.status && <span className="badge">{ROUTE_STATUS[route.status]}</span>}
      </div>
      <dl className="route-summary">
        <div><dt>Motorista</dt><dd>{route.driver ?? '—'}</dd></div>
        <div><dt>Paradas</dt><dd>{route.stops.length}</dd></div>
        <div><dt>Distância</dt><dd>{num(route.total_km)} km</dd></div>
        <div><dt>Tempo</dt><dd>{Math.floor(route.total_min / 60)} h {route.total_min % 60} min</dd></div>
        <div><dt>Custo estimado</dt><dd>{brl(route.est_cost)}</dd></div>
        <div><dt>Carga</dt><dd>{num(route.load_kg)} / {num(route.cap_kg, 0)} kg · {num(route.load_m3, 2)} / {num(route.cap_m3, 2)} m³</dd></div>
      </dl>
      <ol className="stops">
        {route.stops.map((s) => (
          <li key={s.id}>
            <span className="stop-num" style={{ borderColor: route.color }} aria-hidden="true">{s.order}</span>
            <div>
              <strong>{s.code}</strong> · {s.region}
              {s.status && <> · <span className="badge">{DELIVERY_STATUS[s.status]}</span></>}
              <br />
              <span className="hint">
                Chegada prevista {formatTime(s.eta)} (janela {formatTime(s.window_start)}–{formatTime(s.window_end)}) · {num(s.weight_kg)} kg
              </span>
              <br />
              <span className="hint">{s.address}</span>{' '}
              <a href={osm(s)} target="_blank" rel="noreferrer">Abrir no OpenStreetMap<span className="sr-only"> ({s.code}, nova aba)</span></a>
            </div>
          </li>
        ))}
      </ol>
      {children}
    </section>
  )
}
