import { createClient } from '@supabase/supabase-js'
import { env, supabaseConfigured } from './env.js'

if (!supabaseConfigured) {
  console.warn('Supabase não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

// Placeholders evitam que createClient lance erro com .env vazio; as chamadas falham com mensagem tratável.
export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'chave-ausente',
)
