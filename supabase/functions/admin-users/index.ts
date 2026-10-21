// Gestão de usuários (só admin). O cadastro público está desligado (config.toml: enable_signup = false).
// POST { action: 'list' | 'create' | 'update' | 'deactivate' | 'activate', ... } com Authorization: Bearer <JWT>.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas pelo Supabase; a service role nunca sai do servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const ROLES = ['admin', 'gestor_frota', 'despachante', 'motorista'] // = enum public.app_role
const BAN_FOREVER = '876000h' // ~100 anos: "desativar" sem apagar histórico (entregas, PODs, alertas)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new HttpError(400, message)
}
function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new HttpError(400, error.message)
}

async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Sessão ausente. Entre novamente.')
  const { data, error } = await admin.auth.getUser(token) // valida assinatura e expiração no Auth
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida ou expirada. Entre novamente.')
  const { data: prof } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (prof?.role !== 'admin') throw new HttpError(403, 'Apenas administradores podem gerenciar usuários.')
  return data.user.id
}

async function listUsers() {
  const { data: profiles, error } = await admin.from('profiles')
    .select('id, email, full_name, role, created_at').order('full_name')
  fail(error)
  const banned = new Map<string, string | null>()
  for (let page = 1; ; page++) {
    const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    fail(e)
    for (const u of data.users) banned.set(u.id, (u as { banned_until?: string }).banned_until ?? null)
    if (data.users.length < 1000) break
  }
  const now = Date.now()
  return profiles!.map((p) => {
    const until = banned.get(p.id)
    return { ...p, active: !until || new Date(until).getTime() <= now }
  })
}

async function handle(callerId: string, body: Record<string, unknown>) {
  const { action, id } = body
  const role = body.role as string | undefined
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : undefined
  const password = body.password as string | undefined
  if (role !== undefined) check(ROLES.includes(role), 'Perfil inválido.')
  if (password !== undefined) check(typeof password === 'string' && password.length >= 8, 'A senha precisa ter ao menos 8 caracteres.')
  if (action !== 'list' && action !== 'create') check(typeof id === 'string' && id, 'Usuário não informado.')
  // Evita que o admin tranque a si mesmo para fora do sistema.
  if (id === callerId) check(action !== 'deactivate' && (role === undefined || role === 'admin'),
    'Você não pode desativar nem rebaixar o próprio usuário.')

  switch (action) {
    case 'list':
      return { users: await listUsers() }

    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase()
      check(EMAIL_RE.test(email), 'E-mail inválido.')
      check(password, 'Informe a senha inicial.')
      check(role, 'Informe o perfil.')
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: full_name ?? '' },
      })
      fail(error)
      // O trigger handle_new_user cria o profile como 'motorista'; aqui grava o perfil escolhido.
      const { error: pErr } = await admin.from('profiles')
        .upsert({ id: data.user.id, email, full_name: full_name ?? '', role })
      if (pErr) {
        await admin.auth.admin.deleteUser(data.user.id) // não deixa usuário com perfil errado
        fail(pErr)
      }
      return { id: data.user.id }
    }

    case 'update': {
      const patch: Record<string, string> = {}
      if (role !== undefined) patch.role = role
      if (full_name !== undefined) patch.full_name = full_name
      check(Object.keys(patch).length || password, 'Nada para atualizar.')
      if (Object.keys(patch).length) {
        const { data, error } = await admin.from('profiles').update(patch).eq('id', id).select('id')
        fail(error)
        if (!data?.length) throw new HttpError(404, 'Usuário não encontrado.')
      }
      if (password) fail((await admin.auth.admin.updateUserById(id as string, { password })).error)
      return { ok: true }
    }

    case 'deactivate':
    case 'activate': {
      const { error } = await admin.auth.admin.updateUserById(id as string, {
        ban_duration: action === 'deactivate' ? BAN_FOREVER : 'none',
      })
      fail(error)
      return { ok: true }
    }

    default:
      throw new HttpError(400, 'Ação desconhecida.')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const callerId = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    return json(await handle(callerId, body))
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Erro interno. Tente novamente.' }, 500)
  }
})
