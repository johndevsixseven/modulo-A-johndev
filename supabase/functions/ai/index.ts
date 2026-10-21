// Edge Function de IA (Fase 7). POST { action, payload } com Authorization: Bearer <JWT do usuário>.
// Provedor compatível com OpenAI /chat/completions, configurado por AI_PROVIDER, AI_MODEL, AI_BASE_URL, AI_API_KEY.
// Resposta: { ok: true, source: 'ia', data } ou { ok: false, error } (o front cai no cálculo local).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const PROVIDER = (Deno.env.get('AI_PROVIDER') || 'none').toLowerCase()
const API_KEY = Deno.env.get('AI_API_KEY') || ''
const DEFAULT_BASE: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1/',
}
const DEFAULT_MODEL: Record<string, string> = { gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini' }
const BASE = (Deno.env.get('AI_BASE_URL') || DEFAULT_BASE[PROVIDER] || '').replace(/\/?$/, '/')
const MODEL = Deno.env.get('AI_MODEL') || DEFAULT_MODEL[PROVIDER] || ''

const BASE_PROMPT = 'Você é o assistente analítico da SENN AI-X, operadora de logística de última milha. ' +
  'Responda somente com base nos dados fornecidos, em português do Brasil, de forma objetiva. Não invente números. ' +
  'Responda apenas com um objeto JSON válido, sem markdown, no formato: '

// Formato pedido por ação + validação mínima do JSON devolvido.
const ACTIONS: Record<string, { format: string; task: string; valid: (d: any) => boolean }> = {
  forecast: {
    task: 'Refine a previsão de demanda por região a partir do histórico diário e da previsão local.',
    format: '{"regioes":[{"regiao":string,"d7":[7 números],"d30_total":number,"tendencia":"alta"|"estavel"|"queda","comentario":string}]}',
    valid: (d) => Array.isArray(d?.regioes),
  },
  risk: {
    task: 'Explique o risco de atraso de cada entrega crítica e sugira ações.',
    format: '{"itens":[{"id":string,"explicacao":string,"acoes":["replanejar"|"priorizar"|"contatar_cliente"|"trocar_veiculo"]}]}',
    valid: (d) => Array.isArray(d?.itens),
  },
  insights: {
    task: 'Analise os indicadores do período, aponte gargalos, regiões com maior custo e recomendações práticas.',
    format: '{"resumo":string,"gargalos":[string],"regioes_custo":[string],"recomendacoes":[string]}',
    valid: (d) => typeof d?.resumo === 'string',
  },
  chat: {
    task: 'Responda à pergunta do usuário sobre entregas, indicadores ou funcionalidades do sistema usando o contexto. ' +
      'Em "acoes" sugira no máximo 3 links, usando apenas rotas do catálogo de telas fornecido.',
    format: '{"resposta":string,"acoes":[{"rotulo":string,"rota":string}]}',
    valid: (d) => typeof d?.resposta === 'string',
  },
  route_explain: {
    task: 'Explique em poucas frases as rotas geradas (km, carga, janelas e pedidos não alocados).',
    format: '{"texto":string}',
    valid: (d) => typeof d?.texto === 'string',
  },
}

async function llm(system: string, user: string) {
  const res = await fetch(`${BASE}chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0.2, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Provedor de IA respondeu ${res.status}`)
  const body = await res.json()
  const text: string = body?.choices?.[0]?.message?.content ?? ''
  // Alguns modelos embrulham o JSON em ```json ... ```.
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido.' }, 405)

  // Recusa anônimo: valida o JWT no Auth e exige perfil.
  const authHeader = req.headers.get('Authorization') || ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  })
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: u, error: ue } = token ? await sb.auth.getUser(token) : { data: null, error: true }
  if (ue || !u?.user) return json({ ok: false, error: 'Sessão inválida ou expirada.' }, 401)
  const { data: prof } = await sb.from('profiles').select('role').eq('id', u.user.id).maybeSingle()
  if (!prof) return json({ ok: false, error: 'Perfil não encontrado.' }, 403)

  let body: { action?: string; payload?: unknown }
  try { body = await req.json() } catch { return json({ ok: false, error: 'JSON inválido.' }, 400) }
  const spec = ACTIONS[body.action ?? '']
  if (!spec) return json({ ok: false, error: 'Ação inválida.' }, 400)
  const user = JSON.stringify(body.payload ?? {})
  if (user.length > 60000) return json({ ok: false, error: 'Dados grandes demais para a IA.' }, 413)

  if (PROVIDER === 'none' || !API_KEY || !BASE || !MODEL) return json({ ok: false, error: 'AI_DISABLED' })
  try {
    const data = await llm(`${BASE_PROMPT}${spec.format}. Tarefa: ${spec.task}`, `Dados (perfil ${prof.role}): ${user}`)
    if (!spec.valid(data)) throw new Error('JSON da IA fora do formato esperado.')
    return json({ ok: true, source: 'ia', data })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message })
  }
})
