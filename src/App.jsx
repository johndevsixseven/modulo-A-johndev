import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import RequireRole from './auth/RequireRole.jsx'
import { useAuth } from './auth/context.js'
import { HOME_BY_ROLE } from './auth/roles.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Painel from './pages/Painel.jsx'
import Usuarios from './pages/Usuarios.jsx'

// "/" leva cada perfil ao seu painel; rotas proibidas também caem aqui (RequireRole).
function Home() {
  const { profile } = useAuth()
  return <Navigate to={HOME_BY_ROLE[profile.role] ?? '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireRole />}>
            <Route index element={<Home />} />
            <Route element={<Layout />}>
              <Route element={<RequireRole roles={['admin', 'gestor_frota', 'despachante']} />}>
                <Route path="/dashboard" element={<Painel title="Dashboard">KPIs e gráficos chegam na Fase 9.</Painel>} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'gestor_frota']} />}>
                <Route path="/frota" element={<Painel title="Painel da frota">Veículos e motoristas chegam na Fase 4.</Painel>} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'despachante']} />}>
                <Route path="/despacho" element={<Painel title="Painel de despacho">Pedidos e roteirização chegam nas Fases 4 e 5.</Painel>} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'motorista']} />}>
                <Route path="/motorista" element={<Painel title="Minha rota">A rota do dia chega na Fase 5.</Painel>} />
              </Route>
              <Route element={<RequireRole roles={['admin']} />}>
                <Route path="/usuarios" element={<Usuarios />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
