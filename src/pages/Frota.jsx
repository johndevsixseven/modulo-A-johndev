// Painel da Frota (RF01, RF02, RF03) — admin e gestor_frota.
// Ocupação, veículos por status, manutenção/CNH a vencer e links rápidos para cadastros.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { dbMessage } from '../lib/dbError.js'
import { VEHICLE_STATUS, VEHICLE_TYPES, daysUntil, formatDate } from '../lib/labels.js'
import DataTable from '../components/DataTable.jsx'

export default function Frota() {
  const [state, setState] = useState({ loading: true })

  const load = useCallback(async () => {
    const [vRes, dRes, rRes, sRes] = await Promise.all([
      supabase.from('vehicles').select('id, plate, type, status, capacity_kg, next_maintenance'),
      supabase.from('drivers').select('id, name, cnh_expiry, cnh_category, available, vehicle_id, vehicle:vehicles(plate)')
        .is('anonymized_at', null),
      supabase.from('routes').select('load_kg, vehicle:vehicles(capacity_kg)')
        .in('status', ['em_andamento', 'liberada']),
      supabase.from('settings').select('key, value').eq('key', 'alertas'),
    ])
    const error = vRes.error || dRes.error || rRes.error || sRes.error
    if (error) return setState({ loading: false, error: dbMessage(error) })

    const vehicles = vRes.data ?? []
    const drivers = dRes.data ?? []
    const routes = rRes.data ?? []
    const alertas = sRes.data?.[0]?.value ?? {}

    // Veículos por status
    const byStatus = {}
    for (const v of vehicles) byStatus[v.status] = (byStatus[v.status] || 0) + 1

    // Ocupação: soma da carga das rotas ativas / soma da capacidade dos veículos nessas rotas
    const totalLoad = routes.reduce((s, r) => s + Number(r.load_kg || 0), 0)
    const totalCap = routes.reduce((s, r) => s + Number(r.vehicle?.capacity_kg || 0), 0)
    const ocupacao = totalCap > 0 ? totalLoad / totalCap : null

    // Manutenção a vencer (padrão 7 dias do settings.alertas)
    const manutDias = alertas.manutencao_dias ?? 7
    const manutVencer = vehicles
      .filter((v) => v.next_maintenance && daysUntil(v.next_maintenance) <= manutDias && v.status !== 'em_manutencao')
      .sort((a, b) => daysUntil(a.next_maintenance) - daysUntil(b.next_maintenance))

    // CNH a vencer (padrão 30 dias)
    const cnhDias = alertas.cnh_dias ?? 30
    const cnhVencer = drivers
      .filter((d) => d.cnh_expiry && daysUntil(d.cnh_expiry) <= cnhDias)
      .sort((a, b) => daysUntil(a.cnh_expiry) - daysUntil(b.cnh_expiry))

    setState({
      loading: false, vehicles, drivers, byStatus, ocupacao,
      manutVencer, cnhVencer, manutDias, cnhDias,
    })
  }, [])

  useEffect(() => { load() }, [load])

  if (state.loading) return <p role="status">Carregando painel da frota…</p>
  if (state.error) return <p className="error" role="alert">Erro ao carregar: {state.error}</p>

  const { vehicles, byStatus, ocupacao, manutVencer, cnhVencer, manutDias, cnhDias } = state
  const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)

  const kpis = [
    { label: 'Total de veículos', value: vehicles.length, cls: '' },
    { label: 'Disponíveis', value: byStatus.disponivel ?? 0, cls: 'ok' },
    { label: 'Em rota', value: byStatus.em_rota ?? 0, cls: 'info' },
    { label: 'Em manutenção', value: byStatus.em_manutencao ?? 0, cls: 'warn' },
    { label: 'Ocupação da frota', value: pct(ocupacao), cls: '' },
  ]

  const manutCols = [
    { key: 'plate', label: 'Placa' },
    { key: 'type', label: 'Tipo', value: (r) => VEHICLE_TYPES[r.type] },
    { key: 'status', label: 'Status', value: (r) => VEHICLE_STATUS[r.status] },
    { key: 'next_maintenance', label: 'Manutenção em', render: (r) => formatDate(r.next_maintenance) },
    { key: 'dias', label: 'Dias restantes', num: true,
      value: (r) => daysUntil(r.next_maintenance),
      render: (r) => {
        const d = daysUntil(r.next_maintenance)
        return <span className={`badge ${d <= 0 ? 'danger' : d <= 3 ? 'warn' : 'ok'}`}>{d <= 0 ? 'Vencida' : `${d} dia(s)`}</span>
      },
    },
  ]

  const cnhCols = [
    { key: 'name', label: 'Motorista' },
    { key: 'cnh_category', label: 'Categoria' },
    { key: 'cnh_expiry', label: 'Vencimento', render: (r) => formatDate(r.cnh_expiry) },
    { key: 'veiculo', label: 'Veículo', value: (r) => r.vehicle?.plate ?? '—' },
    { key: 'dias', label: 'Dias restantes', num: true,
      value: (r) => daysUntil(r.cnh_expiry),
      render: (r) => {
        const d = daysUntil(r.cnh_expiry)
        return <span className={`badge ${d <= 0 ? 'danger' : d <= 7 ? 'warn' : 'ok'}`}>{d <= 0 ? 'Vencida' : `${d} dia(s)`}</span>
      },
    },
  ]

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Painel da Frota</h1>
        <div className="row-actions">
          <Link to="/veiculos" className="button secondary">Gerenciar veículos</Link>
          <Link to="/motoristas" className="button secondary">Gerenciar motoristas</Link>
        </div>
      </div>
      <p className="page-desc">
        Visão geral da frota: status dos veículos, ocupação, manutenções e CNHs a vencer.
      </p>

      {/* KPIs */}
      <div className="grid kpis" aria-live="polite">
        {kpis.map(({ label, value, cls }) => (
          <div key={label} className="card kpi">
            <span className="hint">{label}</span>
            <strong className={cls}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Manutenção a vencer */}
      <section className="card stack" aria-labelledby="manut-titulo">
        <h2 id="manut-titulo">Manutenção a vencer ({manutDias} dias)</h2>
        <DataTable columns={manutCols} rows={manutVencer} caption="Veículos com manutenção próxima"
          empty={<div className="empty"><p>Nenhum veículo com manutenção nos próximos {manutDias} dias.</p></div>} />
      </section>

      {/* CNH a vencer */}
      <section className="card stack" aria-labelledby="cnh-titulo">
        <h2 id="cnh-titulo">CNH a vencer ({cnhDias} dias)</h2>
        <DataTable columns={cnhCols} rows={cnhVencer} caption="Motoristas com CNH próxima do vencimento"
          empty={<div className="empty"><p>Nenhum motorista com CNH vencendo nos próximos {cnhDias} dias.</p></div>} />
      </section>
    </section>
  )
}
