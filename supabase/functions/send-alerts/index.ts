// RF11 — e-mail de alertas via Resend. POST sem corpo, Authorization: Bearer <JWT da equipe>.
// Pega alertas abertos com emailed_at nulo e severidade alta/média e envia um resumo para ALERT_EMAIL_TO.
// Sem RESEND_API_KEY (ou remetente/destinatário): não envia, registra uma vez por alerta em notification_log
// (channel='email', success=false, "não enviado") e responde { skipped: true } sem erro.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('ALERT_EMAIL_FROM') ?? ''
const TO = Deno.env.get('ALERT_EMAIL_TO') ?? ''

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } }
    if (!u?.user) return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401)
    const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle()
    if (!prof || prof.role === 'motorista') return json({ error: 'Sem permissão.' }, 403)

    const { data: alerts, error } = await admin.from('alerts').select('id, title, message, severity, created_at')
      .eq('status', 'aberto').is('emailed_at', null).in('severity', ['alta', 'media'])
      .order('created_at').limit(50)
    if (error) return json({ error: error.message }, 500)
    if (!alerts.length) return json({ sent: 0 })

    if (!KEY || !FROM || !TO) {
      // Loga "não enviado" só uma vez por alerta (a função roda a cada 60 s).
      const { data: logged } = await admin.from('notification_log').select('alert_id')
        .eq('channel', 'email').in('alert_id', alerts.map((a) => a.id))
      const done = new Set((logged ?? []).map((l) => l.alert_id))
      const rows = alerts.filter((a) => !done.has(a.id)).map((a) => ({
        alert_id: a.id, channel: 'email', recipient: TO || null, success: false,
        error: 'Não enviado: RESEND_API_KEY/ALERT_EMAIL_FROM/ALERT_EMAIL_TO não configurados',
      }))
      if (rows.length) await admin.from('notification_log').insert(rows)
      return json({ skipped: true, logged: rows.length })
    }

    const html = '<h2>Alertas SENN AI-X</h2><ul>' +
      alerts.map((a) => `<li><strong>[${a.severity}] ${esc(a.title)}</strong> — ${esc(a.message)}</li>`).join('') + '</ul>'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: TO.split(',').map((s) => s.trim()), subject: `${alerts.length} alerta(s) novo(s)`, html }),
    })
    const ok = res.ok
    const err = ok ? null : `Resend ${res.status}: ${(await res.text()).slice(0, 200)}`
    await admin.from('notification_log').insert(alerts.map((a) => ({
      alert_id: a.id, channel: 'email', recipient: TO, success: ok, error: err,
    })))
    // Falha não marca emailed_at: tenta de novo na próxima rodada.
    if (ok) await admin.from('alerts').update({ emailed_at: new Date().toISOString() }).in('id', alerts.map((a) => a.id))
    return json({ sent: ok ? alerts.length : 0, error: err })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
