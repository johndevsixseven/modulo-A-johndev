import DemandForecast from '../components/DemandForecast.jsx'

export default function Previsao() {
  return (
    <section className="stack">
      <h1>Previsão de demanda</h1>
      <p className="page-desc">Quantas entregas esperar nos próximos dias, por região.</p>
      <DemandForecast />
    </section>
  )
}
