import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'

// Protege rotas filhas. Sem sessão → /login; perfil fora de `roles` → / (que leva ao painel do perfil).
// O banco (RLS) continua sendo a garantia real; isto só evita telas que o perfil não usa.
export default function RequireRole({ roles }) {
  const { session, profile, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <p className="container" role="status">Carregando…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) {
    return (
      <main className="container">
        <div className="card stack" role="alert">
          <h1>Perfil não encontrado</h1>
          <p>Não conseguimos carregar o seu perfil de acesso. Tente de novo em instantes ou fale com o administrador.</p>
          <div><button type="button" onClick={signOut}>Sair e voltar ao login</button></div>
        </div>
      </main>
    )
  }
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <Outlet />
}
