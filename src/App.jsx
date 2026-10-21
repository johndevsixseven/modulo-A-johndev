import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { supabaseConfigured } from './lib/env.js'

// Página provisória da Fase 1: confirma que getSession() responde. Rotas entram na Fase 3.
export default function App() {
  const [status, setStatus] = useState('Verificando conexão…')

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      if (!supabaseConfigured) setStatus('Supabase não configurado: preencha o .env.')
      else setStatus(error ? `Erro: ${error.message}` : 'Supabase conectado (getSession ok).')
    })
  }, [])

  return (
    <main className="container">
      <div className="card">
        <h1>SENN AI-X · Logística de Última Milha</h1>
        <p role="status">{status}</p>
      </div>
    </main>
  )
}
