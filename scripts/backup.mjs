// Backup lógico (RNF05): exporta cada tabela para backups/AAAA-MM-DD/<tabela>.json.
// Uso (na raiz): node scripts/backup.mjs
// Lê VITE_SUPABASE_URL de .env e SUPABASE_SERVICE_ROLE_KEY de supabase/functions/.env (ou do ambiente).
// A service_role ignora o RLS: exporta tudo. Nunca imprime chaves. backups/ está no .gitignore (contém dados pessoais).
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = (p) => fileURLToPath(new URL(p, import.meta.url))

for (const f of ['../.env', '../supabase/functions/.env']) {
  try {
    process.loadEnvFile(path(f))
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

const TABLES = ['profiles', 'vehicles', 'drivers', 'routes', 'deliveries', 'pods', 'vehicle_positions',
  'alerts', 'notification_log', 'settings']
const PAGE = 1000

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const dir = path(`../backups/${new Date().toISOString().slice(0, 10)}/`)
mkdirSync(dir, { recursive: true })

let failed = 0
for (const t of TABLES) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(t).select('*').range(from, from + PAGE - 1)
    if (error) { console.error(`${t}: erro — ${error.message}`); failed++; break }
    rows.push(...data)
    if (data.length < PAGE) break
  }
  writeFileSync(`${dir}${t}.json`, JSON.stringify(rows, null, 2))
  console.log(`${t}: ${rows.length} linha(s)`)
}
console.log(`Backup salvo em ${dir}`)
process.exit(failed ? 1 : 0)
