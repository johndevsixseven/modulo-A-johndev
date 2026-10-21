import { Suspense, lazy } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import RequireRole from './auth/RequireRole.jsx'
import { useAuth } from './auth/context.js'
import { HOME_BY_ROLE } from './auth/roles.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Painel from './pages/Painel.jsx'
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'))
const AdminDados = lazy(() => import('./pages/AdminDados.jsx'))
import Privacidade from './pages/Privacidade.jsx'
const Veiculos = lazy(() => import('./pages/Veiculos.jsx'))
const Motoristas = lazy(() => import('./pages/Motoristas.jsx'))
const Pedidos = lazy(() => import('./pages/Pedidos.jsx'))
const Roteirizacao = lazy(() => import('./pages/Roteirizacao.jsx'))
const MotoristaHome = lazy(() => import('./pages/MotoristaHome.jsx'))
const Rastreamento = lazy(() => import('./pages/Rastreamento.jsx'))
const Previsao = lazy(() => import('./pages/Previsao.jsx'))
const Riscos = lazy(() => import('./pages/Riscos.jsx'))
const Alertas = lazy(() => import('./pages/Alertas.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))

// "/" leva cada perfil ao seu painel; rotas proibidas também caem aqui (RequireRole).
function Home() {
  const { profile } = useAuth()
  return <Navigate to={HOME_BY_ROLE[profile.role] ?? '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Páginas carregadas sob demanda (RNF02): mapa, gráficos e exportação ficam fora do bundle inicial. */}
        <Suspense fallback={<p role="status" className="container">Carregando…</p>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route element={<RequireRole />}>
            <Route index element={<Home />} />
            <Route element={<Layout />}>
              <Route element={<RequireRole roles={['admin', 'gestor_frota', 'despachante']} />}>
                <Route path="/dashboard" element={<Dashboard />} />
                {/* Escrita decidida na página e garantida no RLS: veículos/motoristas admin+gestor; pedidos admin+despachante. */}
                <Route path="/veiculos" element={<Veiculos />} />
                <Route path="/motoristas" element={<Motoristas />} />
                <Route path="/pedidos" element={<Pedidos />} />
                <Route path="/rastreamento" element={<Rastreamento />} />
                <Route path="/previsao" element={<Previsao />} />
                <Route path="/riscos" element={<Riscos />} />
                <Route path="/alertas" element={<Alertas />} />
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
                <Route path="/admin/dados" element={<AdminDados />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
