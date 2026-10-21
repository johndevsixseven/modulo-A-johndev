import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import ChatHelper from './ChatHelper.jsx'
import { useAuth } from '../auth/context.js'
import { useAlertCount } from '../lib/useAlerts.js'
import { ROLE_LABELS } from '../auth/roles.js'

// Menu agrupado por tarefa e filtrado por perfil (PLANO.md seções 2 e 3).
const NAV = [
  { group: 'Operação', items: [
    { to: '/despacho', label: 'Despacho', roles: ['admin', 'despachante'] },
    { to: '/frota', label: 'Frota', roles: ['admin', 'gestor_frota'] },
    { to: '/roteirizacao', label: 'Roteirização', roles: ['admin', 'despachante'] },
    { to: '/rastreamento', label: 'Rastreamento', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/motorista', label: 'Minha rota', roles: ['admin', 'motorista'] },
  ] },
  { group: 'Cadastros', items: [
    { to: '/veiculos', label: 'Veículos', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/motoristas', label: 'Motoristas', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/pedidos', label: 'Pedidos', roles: ['admin', 'gestor_frota', 'despachante'] },
  ] },
  { group: 'Análise', items: [
    { to: '/dashboard', label: 'Dashboard', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/previsao', label: 'Previsão', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/riscos', label: 'Riscos', roles: ['admin', 'gestor_frota', 'despachante'] },
    { to: '/alertas', label: 'Alertas', roles: ['admin', 'gestor_frota', 'despachante'] },
  ] },
  { group: 'Administração', items: [
    { to: '/usuarios', label: 'Usuários', roles: ['admin'] },
    { to: '/admin/dados', label: 'Dados e LGPD', roles: ['admin'] },
  ] },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(profile.role)) }))
    .filter((g) => g.items.length)
  const alertCount = useAlertCount(profile.role)

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <div className="app-shell">
        <header className="sidebar">
          <div className="sidebar-top">
            <Link to="/" className="brand">SENN AI-X</Link>
            <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="menu-principal"
              onClick={() => setOpen((o) => !o)}>
              Menu
            </button>
          </div>
          <nav id="menu-principal" aria-label="Principal" className={open ? 'nav open' : 'nav'}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            {groups.map((g) => (
              <div key={g.group} className="nav-group">
                <p className="nav-heading" id={`nav-${g.group}`}>{g.group}</p>
                <ul aria-labelledby={`nav-${g.group}`}>
                  {g.items.map((i) => (
                    <li key={i.to}><NavLink to={i.to} onClick={() => setOpen(false)}>
                      <span>{i.label}</span>
                      {i.to === '/alertas' && alertCount > 0 && <span className="badge danger">{alertCount}<span className="sr-only"> abertos</span></span>}
                    </NavLink></li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="user">
              <p><strong>{profile.full_name || profile.email}</strong><span>{ROLE_LABELS[profile.role]}</span></p>
              <button type="button" className="secondary" onClick={signOut}>Sair</button>
            </div>
          </nav>
        </header>
        <div className="app-main">
          <main id="conteudo" className="container" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="container hint app-footer"><Link to="/privacidade">Aviso de privacidade (LGPD)</Link></footer>
        </div>
      </div>
      <ChatHelper />
    </>
  )
}
