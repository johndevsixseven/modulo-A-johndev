import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabaseConfigured } from '../lib/env.js'
import { useAuth } from '../auth/context.js'
import { ROLES, ROLE_LABELS } from '../auth/roles.js'

function loginErrorMessage(error) {
  const msg = error?.message ?? ''
  if (/invalid login credentials/i.test(msg)) return 'Não foi possível entrar com esse e-mail e senha. Confira os dados e tente de novo.'
  if (/banned/i.test(msg)) return 'Este acesso está desativado. Fale com o administrador para reativá-lo.'
  if (/email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado. Fale com o administrador.'
  return 'Não conseguimos falar com o servidor agora. Verifique a conexão e tente de novo.'
}

// RF01: e-mail, senha e perfil. O perfil escolhido é conferido com profiles.role (fonte da verdade).
export default function Login() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Enquanto o envio está em andamento não redireciona: a conferência do perfil pode desfazer o login.
  if (session && profile && !busy) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Informe o e-mail e a senha.')
    if (!role) return setError('Escolha o perfil com que deseja entrar.')
    setBusy(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) return setError(loginErrorMessage(authError))

      const { data: prof, error: profError } = await supabase
        .from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      if (profError || !prof || prof.role !== role) {
        await supabase.auth.signOut()
        return setError(profError
          ? 'Não conseguimos confirmar o seu perfil agora. Tente de novo em instantes.'
          : 'O perfil selecionado não corresponde a este usuário. Escolha o perfil cadastrado para você ou fale com o administrador.')
      }
      navigate('/', { replace: true })
    } catch {
      setError('Não conseguimos falar com o servidor agora. Verifique a conexão e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand">
        <p className="login-logo">SENN AI-X</p>
        <p className="login-tagline">Roteirize, acompanhe e comprove entregas de última milha em um só lugar.</p>
        <svg className="login-lane" viewBox="0 0 400 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M -20 560 C 140 520, 60 380, 200 330 S 330 170, 420 60" />
        </svg>
      </aside>
      <main className="login-main">
      <form className="card stack login-form" onSubmit={handleSubmit} noValidate aria-describedby="login-erro">
        <div>
          <h1>Entrar</h1>
          <p className="hint">Use o e-mail, a senha e o perfil cadastrados para você.</p>
        </div>

        {!supabaseConfigured && (
          <p className="notice" role="status">
            Supabase não configurado: preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no
            arquivo <code>.env</code> e reinicie o <code>npm run dev</code>. O login fica indisponível até lá.
          </p>
        )}

        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="role">Perfil</label>
          <select id="role" required value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Selecione…</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        <p id="login-erro" className="error" role="alert" aria-live="assertive">{error}</p>

        <button type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <p className="hint"><Link to="/privacidade">Aviso de privacidade (LGPD)</Link></p>
      </main>
    </div>
  )
}
