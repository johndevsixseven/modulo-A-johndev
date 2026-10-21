import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { env } from './env.js'

// RNF04 · Assina postgres_changes nas tabelas e chama `fetcher` a cada mudança.
// Se o canal cair (CHANNEL_ERROR/TIMED_OUT/CLOSED), passa a chamar `fetcher` a cada VITE_POLLING_MS.
// Retorna 'realtime' | 'polling' | 'conectando' para o indicador da tela.
export function useLive(tables, fetcher) {
  const [mode, setMode] = useState('conectando')
  const ref = useRef(fetcher)
  useEffect(() => { ref.current = fetcher })
  const key = tables.join()

  useEffect(() => {
    let timer = null
    let pending = null
    const run = () => ref.current()
    // agrupa rajadas de eventos (posição + entrega + rota) numa só recarga
    const bump = () => { clearTimeout(pending); pending = setTimeout(run, 300) }
    const poll = (on) => {
      clearInterval(timer)
      timer = on ? setInterval(run, env.pollingMs) : null
      setMode(on ? 'polling' : 'realtime')
    }
    const ch = supabase.channel(`live-${key}-${Math.random().toString(36).slice(2)}`)
    key.split(',').forEach((table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump))
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { poll(false); run() }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) poll(true)
    })
    return () => { clearInterval(timer); clearTimeout(pending); supabase.removeChannel(ch) }
  }, [key])

  return mode
}
