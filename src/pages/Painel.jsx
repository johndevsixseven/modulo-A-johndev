// Painel provisório da Fase 3: confirma que cada perfil cai na sua tela. Conteúdo real nas fases seguintes.
export default function Painel({ title, children }) {
  return (
    <section className="card stack">
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  )
}
