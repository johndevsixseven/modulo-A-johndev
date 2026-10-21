// Cria 1 usuário de TESTE por perfil, define profiles.role e vincula o motorista ao driver 203 do seed.
// Uso (na raiz): node scripts/seed-users.mjs
// Lê VITE_SUPABASE_URL de .env e SUPABASE_SERVICE_ROLE_KEY de supabase/functions/.env (ou do ambiente).
// Reexecutável: reaproveita as senhas de scripts/test-users.local.json (fora do Git). Nunca imprime chaves.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = (p) => fileURLToPath(new URL(p, import.meta.url))

for (const f of ['../.env', '../supabase/functions/.env']) {
  try {
    process.loadEnvFile(path(f)) // não sobrescreve variáveis já definidas no ambiente
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltam variáveis: VITE_SUPABASE_URL (.env) e SUPABASE_SERVICE_ROLE_KEY (supabase/functions/.env).')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const OUT = path('./test-users.local.json')
const saved = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const DRIVER_ID = '00000000-0000-4000-8000-000000000203' // "Marcos Teixeira (fictício)" do seed.sql

const users = [
  { role: 'admin', email: 'admin@senn-aix.test', full_name: 'Admin Teste' },
  { role: 'gestor_frota', email: 'gestor@senn-aix.test', full_name: 'Gestor de Frota Teste' },
  { role: 'despachante', email: 'despachante@senn-aix.test', full_name: 'Despachante Teste' },
  { role: 'motorista', email: 'motorista@senn-aix.test', full_name: 'Marcos Teixeira (fictício)' },
]

async function findUserId(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u.id
    if (data.users.length < 1000) return null
  }
}

const result = {}
for (const u of users) {
  const password = saved[u.role]?.password ?? randomBytes(12).toString('base64url')
  const created = await supabase.auth.admin.createUser({
    email: u.email, password, email_confirm: true, user_metadata: { full_name: u.full_name },
  })
  let id = created.data?.user?.id
  if (created.error) {
    id = await findUserId(u.email)
    if (!id) throw created.error
    const upd = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true })
    if (upd.error) throw upd.error
  }

  const { error: pErr } = await supabase.from('profiles')
    .upsert({ id, email: u.email, full_name: u.full_name, role: u.role })
  if (pErr) throw pErr

  // Autoverificação: o perfil gravado tem que ser o esperado
  const { data: prof, error: rErr } = await supabase.from('profiles').select('role').eq('id', id).single()
  if (rErr || prof.role !== u.role) throw new Error(`Perfil de ${u.email} não ficou como ${u.role}`)

  if (u.role === 'motorista') {
    const { data: drv, error: dErr } = await supabase.from('drivers')
      .update({ profile_id: id }).eq('id', DRIVER_ID).select('id')
    if (dErr) throw dErr
    if (!drv.length) console.warn('Aviso: motorista 203 não existe — rode o seed.sql antes e execute de novo.')
  }

  result[u.role] = { email: u.email, password }
  console.log(`ok  ${u.role.padEnd(13)} ${u.email}`)
}

writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n')
console.log('Senhas de teste gravadas em scripts/test-users.local.json (ignorado pelo Git).')
