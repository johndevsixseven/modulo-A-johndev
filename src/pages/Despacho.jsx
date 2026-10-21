// Painel de Despacho (RF01, RF04, RF09) — admin e despachante.
// Pedidos do dia por status, riscos críticos e atalhos para roteirização e pedidos.
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import { DELIVERY_STATUS, PRIORITIES, formatDateTime, todayBR } from '../lib/labels.js'
import DataTable from '../components/DataTable.jsx'

const RISK_LEVELS_MAP = { baixo: 'Baixo', medio: 'Médio', critico: 'Crítico' }
const LEVEL_CLASS = { baixo: 'ok', medio: 'warn', critico: 'danger' }

export default function Despacho() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })

  const load = useCallback(async () => {
    const today = todayBR()
    const [pedRes, riskRes] = await Promise.all([
      // Pedidos com janela iniciando hoje
      supabase.from('deliveries')
        .select('id, code, status, priority, region, window_start, window_end, risk_score, risk_level')
        .gte('window_start', `${today}T00:00:00-03:00`)
        .lte('window_start', `${today}T23:59:59-03:00`)
        .order('window_start', { ascending: true })
        .limit(500),
      // Riscos críticos (todas as entregas ativas, não só do dia)
      supabase.from('deliveries')
        .select('id, code, region, priority, status, risk_score, risk_level, risk_reasons, window_end')
        .in('status', ['pendente', 'planejada', 'a_caminho'])
        .gte('risk_score', 60)
        .order('risk_score', { ascending: false })
        .limit(50),
    ])
    const error = pedRes.error || riskRes.error
    if (error) return setState({ loading: false, error: dbMessage(error) })

    const pedidos = pedRes.data ?? []
    const riscos = riskRes.data ?? []

    // Contagem por status
    const byStatus = {}
    for (const p of pedidos) byStatus[p.status] = (byStatus[p.status] || 0) + 1

    setState({ loading: false, pedidos, riscos, byStatus, total: pedidos.length })
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('despacho-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  if (state.loading) return <p role="status">Carregando painel de despacho…</p>
  if (state.error) return <p className="error" role="alert">Erro ao carregar: {state.error}</p>

  const { pedidos, riscos, byStatus, total } = state

  const kpis = [
    { label: 'Pedidos do dia', value: total, cls: '' },
    { label: 'Pendentes', value: byStatus.pendente ?? 0, cls: '' },
    { label: 'Planejados', value: byStatus.planejada ?? 0, cls: 'info' },
    { label: 'A caminho', value: byStatus.a_caminho ?? 0, cls: 'info' },
    { label: 'Entregues', value: byStatus.entregue ?? 0, cls: 'ok' },
    { label: 'Falhas', value: byStatus.falha ?? 0, cls: byStatus.falha ? 'danger' : '' },
  ]

  const riscoCols = [
    { key: 'risk_score', label: 'Pontuação', num: true },
    { key: 'risk_level', label: 'Nível',
      value: (r) => RISK_LEVELS_MAP[r.risk_level] ?? r.risk_level,
      render: (r) => <span className={`badge ${LEVEL_CLASS[r.risk_level] ?? ''}`}>{RISK_LEVELS_MAP[r.risk_level] ?? r.risk_level}</span>,
    },
    { key: 'code', label: 'Pedido' },
    { key: 'region', label: 'Região' },
    { key: 'priority', label: 'Prioridade', value: (r) => PRIORITIES[r.priority] },
    { key: 'status', label: 'Status', value: (r) => DELIVERY_STATUS[r.status] },
    { key: 'window_end', label: 'Fim da janela', render: (r) => formatDateTime(r.window_end) },
    { key: 'risk_reasons', label: 'Motivos', sortable: false,
      value: (r) => (r.risk_reasons ?? []).join('; '),
      render: (r) => (r.risk_reasons?.length ? r.risk_reasons.join('; ') : '—'),
    },
    { key: 'acao', label: 'Ação', sortable: false, value: () => '',
      render: (r) => (
        <button type="button" className="secondary"
          onClick={() => navigate('/roteirizacao', { state: { pedido: r.id } })}>
          Replanejar {r.code}
        </button>
      ),
    },
  ]

  const pedidosCols = [
    { key: 'code', label: 'Código' },
    { key: 'status', label: 'Status',
      value: (r) => DELIVERY_STATUS[r.status],
      render: (r) => {
        const cls = { pendente: '', planejada: 'info', a_caminho: 'info', entregue: 'ok', falha: 'danger', cancelada: 'warn' }
        return <span className={`badge ${cls[r.status] ?? ''}`}>{DELIVERY_STATUS[r.status]}</span>
      },
    },
    { key: 'priority', label: 'Prioridade', value: (r) => PRIORITIES[r.priority] },
    { key: 'region', label: 'Região' },
    { key: 'window_start', label: 'Início janela', render: (r) => formatDateTime(r.window_start) },
    { key: 'window_end', label: 'Fim janela', render: (r) => formatDateTime(r.window_end) },
  ]

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Painel de Despacho</h1>
        <div className="row-actions">
          <Link to="/roteirizacao" className="button">Roteirizar agora</Link>
          <Link to="/pedidos" className="button secondary">Gerenciar pedidos</Link>
        </div>
      </div>
      <p className="page-desc">
        Pedidos do dia, riscos críticos e acesso rápido à roteirização.
      </p>

      {/* KPIs do dia */}
      <div className="grid kpis" aria-live="polite">
        {kpis.map(({ label, value, cls }) => (
          <div key={label} className="card kpi">
            <span className="hint">{label}</span>
            <strong className={cls}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Riscos críticos */}
      <section className="card stack" aria-labelledby="riscos-titulo">
        <div className="page-head">
          <h2 id="riscos-titulo">Riscos críticos ({riscos.length})</h2>
          <Link to="/riscos">Ver todos os riscos</Link>
        </div>
        <DataTable columns={riscoCols} rows={riscos} caption="Entregas com risco crítico"
          empty={<div className="empty"><p>Nenhuma entrega com risco crítico no momento. 🎉</p></div>} />
      </section>

      {/* Pedidos do dia */}
      <section className="card stack" aria-labelledby="pedidos-titulo">
        <div className="page-head">
          <h2 id="pedidos-titulo">Pedidos do dia ({total})</h2>
          <Link to="/pedidos">Ver todos os pedidos</Link>
        </div>
        <DataTable columns={pedidosCols} rows={pedidos} caption="Pedidos com janela hoje" searchLabel="Buscar pedido"
          empty={<div className="empty"><p>Nenhum pedido com janela para hoje.</p>
            <Link to="/pedidos" className="button secondary">Cadastrar pedidos</Link></div>} />
      </section>
    </section>
  )
}
