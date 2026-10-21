// Dashboard (RF10) + Análise Inteligente (RF12). KPIs pela RPC dashboard_kpis; agregados extras no front.
import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import DemandForecast from '../components/DemandForecast.jsx'
import { callAI } from '../lib/ai.js'
import { buildAggregates, localInsights } from '../lib/insights.js'
import { DELIVERY_STATUS, REGIONS, formatDate, todayBR } from '../lib/labels.js'

const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const brl = (n) => (n == null ? '—' : `R$ ${Number(n).toFixed(2)}`)

function Chart({ title, children }) {
  return (
    <figure className="card chart">
      <figcaption><strong>{title}</strong></figcaption>
      <div style={{ width: '100%', height: 260 }}><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </figure>
  )
}

export default function Dashboard() {
  const today = todayBR()
  const [preset, setPreset] = useState('7')
  const [range, setRange] = useState({ from: addDays(today, -6), to: today })
  const [region, setRegion] = useState('')
  const [state, setState] = useState({ loading: true })
  const [analysis, setAnalysis] = useState(null)

  const choose = (p) => {
    setPreset(p)
    if (p !== 'custom') setRange({ from: addDays(today, -(Number(p) - 1)), to: today })
  }

  const load = useCallback(async () => {
    let dq = supabase.from('deliveries').select('code, region, status, priority, window_start, window_end, delivered_at, route_id')
      .gte('window_start', `${range.from}T00:00:00-03:00`).lte('window_start', `${range.to}T23:59:59-03:00`).limit(5000)
    if (region) dq = dq.eq('region', region)
    const [k, d, r] = await Promise.all([
      supabase.rpc('dashboard_kpis', { p_from: range.from, p_to: range.to, p_region: region || null }),
      dq,
      supabase.from('routes').select('id, total_km, load_kg, vehicle:vehicles(plate, capacity_kg, cost_per_km)')
        .gte('route_date', range.from).lte('route_date', range.to).in('status', ['em_andamento', 'concluida']),
    ])
    const error = k.error || d.error || r.error
    if (error) return setState({ loading: false, error: error.message })
    const ids = new Set(d.data.map((x) => x.route_id))
    const routes = region ? r.data.filter((x) => ids.has(x.id)) : r.data
    setState({ loading: false, kpis: k.data, deliveries: d.data, agg: buildAggregates(k.data, d.data, routes) })
    setAnalysis(null)
  }, [range, region])

  useEffect(() => { load() }, [load])

  const { kpis, agg, deliveries } = state
  const periodo = `${formatDate(range.from)} a ${formatDate(range.to)}`
  const kpiRows = kpis ? [
    ['OTD (no prazo)', pct(kpis.otd)], ['Custo por entrega', brl(kpis.custo_por_entrega)],
    ['Km rodados', `${kpis.km_rodados} km`], ['Ocupação da frota', pct(kpis.ocupacao)],
    ['Entregas no período', kpis.total], ['Finalizadas', kpis.finalizadas],
  ] : []
  const porStatus = (kpis?.por_status ?? []).map((s) => ({ Status: DELIVERY_STATUS[s.status] ?? s.status, Total: s.total }))
  const porRegiao = (kpis?.por_regiao ?? []).map((s) => ({ Região: s.regiao, Total: s.total, Entregues: s.entregues, Falhas: s.falhas, 'No prazo': s.no_prazo }))

  const exportData = () => ({
    periodo, regiao: region, kpis: kpiRows.map(([a, b]) => [a, String(b)]), porStatus, porRegiao,
    entregas: deliveries.map((x) => ({ Código: x.code, Região: x.region, Status: DELIVERY_STATUS[x.status], Prioridade: x.priority,
      'Janela fim': x.window_end, 'Entregue em': x.delivered_at ?? '' })),
  })
  const doExport = async (kind) => {
    const m = await import('../lib/export.js')
    if (kind === 'pdf') m.exportPDF(exportData())
    else m.exportExcel(exportData())
  }

  const analyze = async (useAI) => {
    setAnalysis({ loading: true })
    const r = useAI ? await callAI('insights', { periodo, regiao: region || 'todas', ...agg }, () => localInsights(agg))
      : { data: localInsights(agg), source: 'local' }
    setAnalysis(r)
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="row-actions">
          <button type="button" className="secondary" disabled={!kpis} onClick={() => doExport('pdf')}>Exportar PDF</button>
          <button type="button" className="secondary" disabled={!kpis} onClick={() => doExport('xlsx')}>Exportar Excel</button>
        </div>
      </div>

      <form className="card grid" onSubmit={(e) => e.preventDefault()} aria-label="Filtros">
        <div className="field">
          <label htmlFor="f-periodo">Período</label>
          <select id="f-periodo" value={preset} onChange={(e) => choose(e.target.value)}>
            <option value="1">Hoje</option><option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option><option value="custom">Personalizado</option>
          </select>
        </div>
        {preset === 'custom' && <>
          <div className="field"><label htmlFor="f-de">De</label>
            <input id="f-de" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></div>
          <div className="field"><label htmlFor="f-ate">Até</label>
            <input id="f-ate" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></div>
        </>}
        <div className="field">
          <label htmlFor="f-regiao">Região</label>
          <select id="f-regiao" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Todas</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </form>

      {state.error && <p className="error" role="alert">Não foi possível carregar os indicadores: {state.error}</p>}
      {state.loading && !kpis && <p aria-live="polite">Carregando indicadores…</p>}

      {kpis && <>
        <div className="grid kpis" aria-live="polite">
          {kpiRows.slice(0, 4).map(([label, value]) => (
            <div key={label} className="card kpi"><span className="hint">{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <p className="hint">{kpis.total} entregas no período ({kpis.finalizadas} finalizadas). OTD = entregues no prazo ÷ finalizadas.</p>

        <div className="grid charts">
          <Chart title="Entregas por status">
            <BarChart data={porStatus}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="Status" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="Total" fill="var(--primary)" /></BarChart>
          </Chart>
          <Chart title="Entregas por região">
            <BarChart data={porRegiao}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="Região" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="Entregues" fill="var(--success)" /><Bar dataKey="Falhas" fill="var(--danger)" /></BarChart>
          </Chart>
          <Chart title="Série diária">
            <LineChart data={(kpis.por_dia ?? []).map((x) => ({ ...x, dia: formatDate(x.dia).slice(0, 5) }))}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Line dataKey="total" name="Total" stroke="var(--primary)" /><Line dataKey="entregues" name="Entregues" stroke="var(--success)" />
              <Line dataKey="falhas" name="Falhas" stroke="var(--danger)" /></LineChart>
          </Chart>
        </div>

        <section className="card stack" aria-labelledby="previsao-titulo">
          <div className="page-head">
            <h2 id="previsao-titulo">Previsão de demanda (7 e 30 dias)</h2>
            <Link to="/previsao">Ver previsão completa</Link>
          </div>
          <DemandForecast compact />
        </section>

        <section className="card stack" aria-labelledby="analise-titulo">
          <div className="page-head">
            <h2 id="analise-titulo">Análise Inteligente</h2>
            <div className="row-actions">
              <button type="button" disabled={analysis?.loading} onClick={() => analyze(true)}>Gerar análise com IA</button>
              <button type="button" className="secondary" disabled={analysis?.loading} onClick={() => analyze(false)}>Análise por regras</button>
            </div>
          </div>
          <div aria-live="polite">
            {analysis?.loading && <p>Gerando análise…</p>}
            {analysis?.data && <div className="stack">
              <p><span className={analysis.source === 'ia' ? 'badge ok' : 'badge warn'}>{analysis.source === 'ia' ? 'Gerado por IA' : 'Cálculo local'}</span> {analysis.data.resumo}</p>
              {[['Gargalos', analysis.data.gargalos], ['Regiões com maior custo', analysis.data.regioes_custo], ['Recomendações', analysis.data.recomendacoes]]
                .filter(([, l]) => l?.length).map(([t, l]) => (
                  <div key={t}><h3>{t}</h3><ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                ))}
            </div>}
          </div>
          <div className="grid charts">
            <Chart title="Custo por entrega por região (R$)">
              <BarChart data={agg.regioes}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="regiao" /><YAxis /><Tooltip />
                <Bar dataKey="custo_por_entrega" name="Custo por entrega" fill="var(--primary)" /></BarChart>
            </Chart>
            <Chart title="Atrasos por horário (fim da janela)">
              <BarChart data={agg.atrasos_hora}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hora" /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="total" name="Atrasos" fill="var(--warning)" /></BarChart>
            </Chart>
          </div>
        </section>
      </>}
    </section>
  )
}
