import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { ROLES, ROLE_LABELS } from '../auth/roles.js'

// Chama a Edge Function admin-users (a service role fica só no servidor) e devolve a mensagem de erro dela.
async function adminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const detail = await error.context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? 'Não conseguimos falar com o servidor. Tente de novo em instantes.')
  }
  return data
}

const EMPTY = { full_name: '', email: '', password: '', role: 'motorista' }

export default function Usuarios() {
  const { profile } = useAuth()
  const [users, setUsers] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => adminUsers({ action: 'list' })
    .then((d) => setUsers(d.users))
    .catch((e) => { setUsers([]); setMsg({ text: e.message, error: true }) }), [])

  useEffect(() => { load() }, [load])

  async function run(body, okText) {
    setBusy(true)
    setMsg({ text: '', error: false })
    try {
      await adminUsers(body)
      setMsg({ text: okText, error: false })
      await load()
      return true
    } catch (e) {
      setMsg({ text: e.message, error: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (await run({ action: 'create', ...form }, `Usuário ${form.email} criado.`)) setForm(EMPTY)
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="stack">
      <h1>Usuários</h1>
      <p className="page-desc">Crie acessos e defina o perfil de cada pessoa da equipe.</p>
      <p className={msg.error ? 'error' : 'success'} role="status" aria-live="polite">{msg.text}</p>

      <form className="card stack" onSubmit={handleCreate}>
        <h2>Novo usuário</h2>
        <div className="grid">
          <div className="field">
            <label htmlFor="u-nome">Nome completo</label>
            <input id="u-nome" required value={form.full_name} onChange={set('full_name')} />
          </div>
          <div className="field">
            <label htmlFor="u-email">E-mail</label>
            <input id="u-email" type="email" required autoComplete="off" value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label htmlFor="u-senha">Senha inicial (mín. 8 caracteres)</label>
            <input id="u-senha" type="password" required minLength={8} autoComplete="new-password"
              value={form.password} onChange={set('password')} />
          </div>
          <div className="field">
            <label htmlFor="u-perfil">Perfil</label>
            <select id="u-perfil" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="row-actions"><button type="submit" disabled={busy}>Criar usuário</button></div>
      </form>

      <section className="card stack" aria-labelledby="lista-usuarios">
        <h2 id="lista-usuarios">Cadastrados</h2>
        {users === null ? <p role="status">Carregando…</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th>
                  <th scope="col">Situação</th><th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === profile.id
                  return (
                    <tr key={u.id}>
                      <td>{u.full_name || '—'}</td>
                      <td>{u.email}</td>
                      <td>
                        <label className="sr-only" htmlFor={`perfil-${u.id}`}>Perfil de {u.email}</label>
                        <select id={`perfil-${u.id}`} value={u.role} disabled={busy || self}
                          onChange={(e) => run({ action: 'update', id: u.id, role: e.target.value },
                            `Perfil de ${u.email} alterado para ${ROLE_LABELS[e.target.value]}.`)}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                      <td>{u.active ? 'Ativo' : 'Desativado'}</td>
                      <td>
                        {!self && (
                          <button type="button" className="secondary" disabled={busy}
                            onClick={() => run({ action: u.active ? 'deactivate' : 'activate', id: u.id },
                              `${u.email} ${u.active ? 'desativado' : 'reativado'}.`)}>
                            {u.active ? 'Desativar' : 'Reativar'}<span className="sr-only"> {u.email}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
