import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export const STAFF = ['admin', 'gestor_frota', 'despachante']

// Roda a verificação de alertas e o envio de e-mail (a função só envia se RESEND_API_KEY existir).
export async function runAlertCheck() {
  const { data, error } = await supabase.rpc('check_alerts')
  if (!error) await supabase.functions.invoke('send-alerts').catch(() => {})
  return { created: data ?? 0, error }
}

/**
 * Enquanto um usuário da equipe estiver logado: check_alerts a cada 60 s (RF11) e contador de alertas abertos
 * em tempo real para o menu. Para o motorista não faz nada (RLS não deixa ver alertas).
 */
export function useAlertCount(role) {
  const [count, setCount] = useState(0)
  const staff = STAFF.includes(role)

  const recount = useCallback(() => supabase.from('alerts').select('id', { count: 'exact', head: true })
    .eq('status', 'aberto').then(({ count }) => setCount(count ?? 0)), [])

  useEffect(() => {
    if (!staff) return
    const tick = () => runAlertCheck().then(recount)
    tick()
    const id = setInterval(tick, 60000)
    const ch = supabase.channel('alerts-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, recount).subscribe()
    return () => { clearInterval(id); supabase.removeChannel(ch) }
  }, [staff, recount])

  return staff ? count : 0
}
