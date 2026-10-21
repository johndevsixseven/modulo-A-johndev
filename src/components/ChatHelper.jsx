// Chatbot "SENN AI-X Helper" (RF13): botão flutuante + <dialog> modal (Esc fecha e o foco fica preso no diálogo).
// Pergunta vai para a IA com contexto real; se falhar, chatFallback responde por palavra-chave.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { supabase } from '../lib/supabase.js'
import { callAI } from '../lib/ai.js'
import { chatFallback, detectIntent, screensFor } from '../lib/chatFallback.js'
import { DELIVERY_STATUS, todayBR } from '../lib/labels.js'

async function buildContext(question, role, today) {
  const intent = detectIntent(question, role)
  const [k, alerts, entrega] = await Promise.all([
    role === 'motorista' ? { data: null } : supabase.rpc('dashboard_kpis', { p_from: today, p_to: today }),
    supabase.from('alerts').select('type, severity, title').eq('status', 'aberto').order('created_at', { ascending: false }).limit(10),
    intent.code ? supabase.from('deliveries').select('code, status, region, window_start, window_end, eta, delivered_at')
      .in('code', [intent.code, intent.code.replace(/^([A-Z]+)-?/, '$1-')]).limit(1).maybeSingle() : { data: null },
  ])
  return {
    hoje: today, perfil: role,
    kpis_hoje: k.data && { otd: k.data.otd, custo_por_entrega: k.data.custo_por_entrega, km_rodados: k.data.km_rodados,
      ocupacao: k.data.ocupacao, total: k.data.total, por_status: k.data.por_status },
    alertas_abertos: alerts.data ?? [],
    entrega_citada: entrega.data ?? (intent.code ? `Entrega ${intent.code} não encontrada ou sem acesso.` : null),
    catalogo_telas: screensFor(role).map(({ rota, rotulo, desc }) => ({ rota, rotulo, desc })),
  }
}

export default function ChatHelper() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const dialog = useRef(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const role = profile.role
  const allowed = new Set(screensFor(role).map((s) => s.rota))

  const ask = async (e) => {
    e.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    setMsgs((m) => [...m, { from: 'user', text: q }])
    const today = todayBR()
    const fallback = () => chatFallback(q, { sb: supabase, role, today, labels: DELIVERY_STATUS })
    let r
    try {
      r = await callAI('chat', { pergunta: q, contexto: await buildContext(q, role, today) }, fallback)
    } catch {
      r = await callAI('chat', {}, fallback) // contexto falhou: vai direto ao fallback
    }
    const data = r.data ?? { resposta: 'Não consegui responder agora. Tente novamente.', acoes: [] }
    // Só mostra links para telas que o perfil pode abrir.
    const acoes = (data.acoes ?? []).filter((a) => allowed.has(a.rota))
    setMsgs((m) => [...m, { from: 'bot', text: data.resposta, acoes, source: r.source }])
    setBusy(false)
  }

  const go = (rota) => { dialog.current.close(); navigate(rota) }

  return (
    <>
      <button type="button" className="chat-fab" aria-haspopup="dialog" onClick={() => dialog.current.showModal()}>
        Ajuda IA
      </button>
      <dialog ref={dialog} className="chat-dialog" aria-labelledby="chat-titulo">
        <div className="page-head">
          <h2 id="chat-titulo">SENN AI-X Helper</h2>
          <button type="button" className="secondary" onClick={() => dialog.current.close()}>Fechar</button>
        </div>
        <ol className="chat-log" aria-live="polite">
          {!msgs.length && <li className="hint">Pergunte, por exemplo: "qual o status da entrega PED-0001?", "qual o OTD de hoje?" ou "como faço a roteirização?"</li>}
          {msgs.map((m, i) => (
            <li key={i} className={m.from === 'user' ? 'chat-user' : 'chat-bot'}>
              <span className="sr-only">{m.from === 'user' ? 'Você: ' : 'Assistente: '}</span>
              {m.text}
              {m.source && <> <span className={m.source === 'ia' ? 'badge ok' : 'badge warn'}>{m.source === 'ia' ? 'IA' : 'Local'}</span></>}
              {m.acoes?.length > 0 && <div className="row-actions">
                {m.acoes.map((a) => <button key={a.rota} type="button" className="secondary" onClick={() => go(a.rota)}>{a.rotulo}</button>)}
              </div>}
            </li>
          ))}
          {busy && <li className="hint">Pensando…</li>}
        </ol>
        <form className="row-actions" onSubmit={ask}>
          <label htmlFor="chat-pergunta" className="sr-only">Sua pergunta</label>
          <input id="chat-pergunta" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus style={{ flex: 1 }} />
          <button type="submit" disabled={busy || !text.trim()}>Enviar</button>
        </form>
      </dialog>
    </>
  )
}
