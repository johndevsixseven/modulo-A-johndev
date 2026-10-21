import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { ROLE_LABELS } from '../auth/roles.js'

// Menu filtrado por perfil (PLANO.md seções 2 e 3). Novas telas entram aqui nas próximas fases.
const NAV = [
  { to: '/dashboard', label: 'Dashboard', roles: ['admin', 'gestor_frota', 'despachante'] },
  { to: '/frota', label: 'Frota', roles: ['admin', 'gestor_frota'] },
  { to: '/despacho', label: 'Despacho', roles: ['admin', 'despachante'] },
  { to: '/veiculos', label: 'Veículos', roles: ['admin', 'gestor_frota', 'despachante'] },
  { to: '/motoristas', label: 'Motoristas', roles: ['admin', 'gestor_frota', 'despachante'] },
  { to: '/pedidos', label: 'Pedidos', roles: ['admin', 'gestor_frota', 'despachante'] },
  { to: '/roteirizacao', label: 'Roteirização', roles: ['admin', 'despachante'] },
  { to: '/motorista', label: 'Minha rota', roles: ['admin', 'motorista'] },
  { to: '/usuarios', label: 'Usuários', roles: ['admin'] },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = NAV.filter((i) => i.roles.includes(profile.role))

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="topbar">
        <div className="topbar-inner">
          <strong>SENN AI-X</strong>
          <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="menu-principal"
            onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
          <nav id="menu-principal" aria-label="Principal" className={open ? 'nav open' : 'nav'}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <ul>
              {items.map((i) => (
                <li key={i.to}><NavLink to={i.to} onClick={() => setOpen(false)}>{i.label}</NavLink></li>
              ))}
            </ul>
          </nav>
          <div className="user">
            <span>{profile.full_name || profile.email} · {ROLE_LABELS[profile.role]}</span>
            <button type="button" className="secondary" onClick={signOut}>Sair</button>
          </div>
        </div>
      </header>
      <main id="conteudo" className="container" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
