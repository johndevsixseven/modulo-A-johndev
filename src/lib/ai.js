// Cliente da Edge Function `ai` (Fase 7).
//
//   callAI(action, payload, fallbackFn?) → Promise<{ ok, data, fallback, source, error? }>
//
//   action:     'forecast' | 'risk' | 'insights' | 'chat' | 'route_explain'
//   payload:    objeto enviado à IA (agregados já calculados no front; ver tabela da Fase 7 no PLANO.md)
//   fallbackFn: opcional, () => data | Promise<data>. Usado quando VITE_ENABLE_AI=false, a função falha,
//               demora mais de 25 s ou devolve JSON fora do formato.
//   Retorno:    ok=true + source='ia' + fallback=false   → data é o JSON da IA
//               ok=true + source='local' + fallback=true → data é o resultado de fallbackFn
//               ok=false + fallback=true + data=null     → sem IA e sem fallbackFn (error explica)
//   Nunca lança. A UI mostra o selo "Gerado por IA" (source 'ia') ou "Cálculo local" (source 'local').
import { supabase } from './supabase.js'
import { env } from './env.js'

const TIMEOUT_MS = 25000

async function local(fallbackFn, error) {
  if (!fallbackFn) return { ok: false, data: null, fallback: true, source: 'local', error }
  try {
    return { ok: true, data: await fallbackFn(), fallback: true, source: 'local', error }
  } catch (e) {
    return { ok: false, data: null, fallback: true, source: 'local', error: e.message }
  }
}

export async function callAI(action, payload = {}, fallbackFn) {
  if (!env.enableAI) return local(fallbackFn, 'IA desativada (VITE_ENABLE_AI=false)')
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado')), TIMEOUT_MS))
    const { data, error } = await Promise.race([supabase.functions.invoke('ai', { body: { action, payload } }), timeout])
    if (error) throw error
    if (!data?.ok || !data.data) throw new Error(data?.error || 'Resposta inválida da IA')
    return { ok: true, data: data.data, fallback: false, source: 'ia' }
  } catch (e) {
    return local(fallbackFn, e.message)
  }
}

// Nome usado no PLANO.md.
export const askAI = callAI
