import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import { callAI } from '../lib/ai.js'
import { addDays, forecastDemand } from '../lib/forecast.js'
import { formatDate, todayBR } from '../lib/labels.js'

const short = (day) => formatDate(day).slice(0, 5)

/**
 * RF08 — previsão de demanda por região. Usado na rota /previsao e, com `compact`, como resumo no Dashboard
 * (só a tabela 7/30 dias, sem gráficos nem IA).
 */
export default function DemandForecast({ compact = false }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [horizon, setHorizon] = useState(7)
  const [ai, setAi] = useState({ busy: false, text: '', data: null })
  const today = todayBR()

  useEffect(() => {
    supabase.rpc('demand_history', { p_days: 60 }).then(({ data, error }) => {
      if (error) setError(dbMessage(error))
      setRows(data ?? [])
    })
  }, [])

  const fc = useMemo(() => (rows ? forecastDemand(rows, today) : []), [rows, today])

  const lineData = useMemo(() => {
    if (!rows) return []
    const hist = Array.from({ length: 28 }, (_, i) => {
      const day = addDays(today, i - 28)
      return { day: short(day), historico: rows.filter((r) => r.day === day).reduce((s, r) => s + r.total, 0) }
    })
    const prev = Array.from({ length: horizon }, (_, i) => ({
      day: short(addDays(today, i)),
      previsao: Math.round(fc.reduce((s, f) => s + f.daily[i].value, 0) * 10) / 10,
    }))
    // Liga as duas linhas no último dia do histórico.
    if (hist.length) hist[hist.length - 1].previsao = hist[hist.length - 1].historico
    return [...hist, ...prev]
  }, [rows, fc, horizon, today])

  const barData = fc.map((f) => ({ region: f.region, previsao: horizon === 7 ? f.d7_total : f.d30_total }))

  async function refine() {
    setAi({ busy: true, text: '', data: null })
    const payload = {
      historico: rows,
      previsao_local: fc.map(({ region, d7, d30_total, mm28, factors }) => ({ regiao: region, d7, d30_total, mm28, fatores: factors })),
    }
    const r = await callAI('forecast', payload)
    setAi(r.ok && !r.fallback
      ? { busy: false, text: 'Gerado por IA', data: r.data }
      : { busy: false, text: 'IA indisponível no momento: mantida a previsão por cálculo local.', data: null })
  }

  if (rows === null) return <p role="status">Carregando previsão…</p>
  if (error) return <p className="error" role="alert">{error}</p>
  if (fc.length === 0) {
    return <div className="empty"><p>Sem histórico de entregas nos últimos 60 dias para prever a demanda.</p></div>
  }

  const table = (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Previsão de entregas por região</caption>
        <thead>
          <tr>
            <th scope="col">Região</th>
            <th scope="col">Média 28 dias</th>
            {!compact && fc[0].daily.slice(0, 7).map((d) => <th key={d.day} scope="col">{short(d.day)}</th>)}
            <th scope="col">Total 7 dias</th>
            <th scope="col">Total 30 dias</th>
          </tr>
        </thead>
        <tbody>
          {fc.map((f) => (
            <tr key={f.region}>
              <th scope="row">{f.region}</th>
              <td>{f.mm28}</td>
              {!compact && f.d7.map((v, i) => <td key={i}>{v}</td>)}
              <td>{f.d7_total}</td>
              <td>{f.d30_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  if (compact) return table

  return (
    <div className="stack">
      <div className="page-head">
        <fieldset className="row-actions">
          <legend className="sr-only">Horizonte da previsão</legend>
          {[7, 30].map((h) => (
            <button key={h} type="button" className={horizon === h ? '' : 'secondary'} aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}>{h} dias</button>
          ))}
        </fieldset>
        <button type="button" className="secondary" onClick={refine} disabled={ai.busy}>
          {ai.busy ? 'Consultando IA…' : 'Refinar com IA'}
        </button>
      </div>
      <p className="hint">Cálculo local: média móvel dos últimos 28 dias × fator do dia da semana.</p>

      <section className="card stack" aria-label="Entregas por dia: histórico e previsão">
        <h2>Entregas por dia (todas as regiões)</h2>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" minTickGap={16} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="historico" name="Histórico" stroke="var(--primary)" dot={false} />
              <Line type="monotone" dataKey="previsao" name="Previsão" stroke="var(--signal)" strokeDasharray="6 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card stack" aria-label={`Previsão por região em ${horizon} dias`}>
        <h2>Previsão por região — próximos {horizon} dias</h2>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="region" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="previsao" name="Entregas previstas" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {table}
      </section>

      {ai.text && (
        <section className="card stack" aria-live="polite">
          <p><span className="badge">{ai.data ? 'Gerado por IA' : 'Cálculo local'}</span> {ai.data ? '' : ai.text}</p>
          {ai.data?.regioes?.map((r) => (
            <p key={r.regiao}><strong>{r.regiao}</strong>{r.tendencia ? ` (${r.tendencia})` : ''}: {r.comentario}</p>
          ))}
        </section>
      )}
    </div>
  )
}
