// Chatbot SENN AI-X Helper (RF13): catálogo de telas, detecção de intenção por palavra-chave e
// respostas locais com dados reais (usadas quando a IA está desligada ou falha).
// O client Supabase é recebido por parâmetro para o módulo ser testável no Node (chatFallback.test.js).

export const SCREENS = [
  { rota: '/dashboard', rotulo: 'Dashboard', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'KPIs (OTD, custo por entrega, km, ocupação), gráficos, exportação PDF/Excel e Análise Inteligente.' },
  { rota: '/pedidos', rotulo: 'Pedidos', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Cadastrar, editar e importar pedidos por CSV.' },
  { rota: '/roteirizacao', rotulo: 'Roteirização', roles: ['admin', 'despachante'], desc: 'Gerar, revisar e liberar as rotas do dia.' },
  { rota: '/veiculos', rotulo: 'Veículos', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Cadastro da frota, capacidade e manutenção.' },
  { rota: '/motoristas', rotulo: 'Motoristas', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Cadastro de motoristas, CNH e disponibilidade.' },
  { rota: '/rastreamento', rotulo: 'Rastreamento', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Posição dos veículos em tempo real no mapa.' },
  { rota: '/alertas', rotulo: 'Alertas', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Alertas de atraso, veículo parado, manutenção e risco.' },
  { rota: '/previsao', rotulo: 'Previsão', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Previsão de demanda por região (7 e 30 dias).' },
  { rota: '/riscos', rotulo: 'Riscos', roles: ['admin', 'gestor_frota', 'despachante'], desc: 'Entregas com risco de atraso e ações sugeridas.' },
  { rota: '/motorista', rotulo: 'Minha rota', roles: ['admin', 'motorista'], desc: 'Rota do dia do motorista e comprovação de entrega.' },
  { rota: '/usuarios', rotulo: 'Usuários', roles: ['admin'], desc: 'Gestão de usuários e perfis.' },
]

export const screensFor = (role) => SCREENS.filter((s) => s.roles.includes(role))

const CODE_RE = /\b([A-Z]{2,}-?\d+)\b/i
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Intenção da pergunta: { type: 'entrega'|'atrasadas'|'otd'|'custo'|'alertas'|'tela'|'ajuda', code?, screen? }
export function detectIntent(text, role = 'admin') {
  const code = text.match(CODE_RE)?.[1]
  if (code) return { type: 'entrega', code: code.toUpperCase() }
  const t = norm(text)
  if (t.includes('atrasad') || t.includes('atraso')) return { type: 'atrasadas' }
  if (t.includes('otd') || t.includes('no prazo') || t.includes('pontualidade')) return { type: 'otd' }
  if (t.includes('custo') || t.includes('km')) return { type: 'custo' }
  if (t.includes('alerta')) return { type: 'alertas' }
  const screen = screensFor(role).find((s) => t.includes(norm(s.rotulo)) || t.includes(s.rota.slice(1)))
  if (screen || /\b(como|onde)\b/.test(t)) return { type: 'tela', screen }
  return { type: 'ajuda' }
}

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const link = (rota, role) => screensFor(role).filter((s) => s.rota === rota).map(({ rotulo }) => ({ rotulo, rota }))

// Resposta local: { resposta, acoes:[{rotulo, rota}] } no mesmo formato da ação `chat` da IA.
export async function chatFallback(text, { sb, role, today, labels = {} }) {
  const intent = detectIntent(text, role)
  if (intent.type === 'entrega') {
    const { data } = await sb.from('deliveries').select('code, status, eta, window_end, region')
      .in('code', [intent.code, intent.code.replace(/^([A-Z]+)-?/, '$1-')]).limit(1).maybeSingle()
    if (!data) return { resposta: `Não encontrei a entrega ${intent.code} (ou você não tem acesso a ela).`, acoes: link('/pedidos', role) }
    return {
      resposta: `A entrega ${data.code} (${data.region}) está com status "${labels[data.status] ?? data.status}".` +
        (data.eta ? ` Previsão de chegada: ${new Date(data.eta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` : ''),
      acoes: link('/pedidos', role),
    }
  }
  if (intent.type === 'atrasadas') {
    const { count } = await sb.from('deliveries').select('id', { count: 'exact', head: true })
      .in('status', ['pendente', 'planejada', 'a_caminho']).lt('window_end', new Date().toISOString())
    return { resposta: `Há ${count ?? 0} entrega(s) em aberto com a janela já vencida.`, acoes: [...link('/riscos', role), ...link('/alertas', role)] }
  }
  if (intent.type === 'otd' || intent.type === 'custo') {
    const { data: k } = await sb.rpc('dashboard_kpis', { p_from: today, p_to: today })
    const resposta = intent.type === 'otd'
      ? `OTD de hoje: ${pct(k?.otd)} (${k?.finalizadas ?? 0} entregas finalizadas de ${k?.total ?? 0}).`
      : `Hoje: custo por entrega ${k?.custo_por_entrega == null ? '—' : `R$ ${Number(k.custo_por_entrega).toFixed(2)}`}, ${k?.km_rodados ?? 0} km rodados.`
    return { resposta, acoes: link('/dashboard', role) }
  }
  if (intent.type === 'alertas') {
    const { count } = await sb.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'aberto')
    return { resposta: `Há ${count ?? 0} alerta(s) aberto(s).`, acoes: link('/alertas', role) }
  }
  if (intent.type === 'tela' && intent.screen) {
    return { resposta: `${intent.screen.rotulo}: ${intent.screen.desc}`, acoes: [{ rotulo: intent.screen.rotulo, rota: intent.screen.rota }] }
  }
  return {
    resposta: 'Posso informar o status de uma entrega (ex.: "status da PED-0001"), entregas atrasadas, OTD, custo, alertas abertos ou explicar uma tela. Telas disponíveis: ' +
      screensFor(role).map((s) => s.rotulo).join(', ') + '.',
    acoes: screensFor(role).slice(0, 3).map(({ rotulo, rota }) => ({ rotulo, rota })),
  }
}
