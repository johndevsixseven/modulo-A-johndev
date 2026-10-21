import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import RequireRole from './auth/RequireRole.jsx'
import { useAuth } from './auth/context.js'
import { HOME_BY_ROLE } from './auth/roles.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Painel from './pages/Painel.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Veiculos from './pages/Veiculos.jsx'
import Motoristas from './pages/Motoristas.jsx'
import Pedidos from './pages/Pedidos.jsx'
import Roteirizacao from './pages/Roteirizacao.jsx'
import MotoristaHome from './pages/MotoristaHome.jsx'

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
                {/* Escrita decidida na página e garantida no RLS: veículos/motoristas admin+gestor; pedidos admin+despachante. */}
                <Route path="/veiculos" element={<Veiculos />} />
                <Route path="/motoristas" element={<Motoristas />} />
                <Route path="/pedidos" element={<Pedidos />} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'gestor_frota']} />}>
                <Route path="/frota" element={<Painel title="Painel da frota">Cadastros: <Link to="/veiculos">Veículos</Link> · <Link to="/motoristas">Motoristas</Link>. Indicadores da frota chegam nas próximas fases.</Painel>} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'despachante']} />}>
                <Route path="/despacho" element={<Painel title="Painel de despacho">Cadastros: <Link to="/pedidos">Pedidos</Link> (com importação CSV) · <Link to="/roteirizacao">Roteirização</Link> (gerar e liberar as rotas do dia).</Painel>} />
                <Route path="/roteirizacao" element={<Roteirizacao />} />
              </Route>
              <Route element={<RequireRole roles={['admin', 'motorista']} />}>
                <Route path="/motorista" element={<MotoristaHome />} />
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
