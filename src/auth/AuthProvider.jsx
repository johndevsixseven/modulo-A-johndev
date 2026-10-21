import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { AuthContext } from './context.js'

// Sessão do Supabase Auth + linha de public.profiles do usuário logado.
// session: undefined = carregando, null = deslogado. profile: undefined = carregando, null = não encontrado.
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [loaded, setLoaded] = useState({ userId: null, profile: undefined })
  const userId = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  // Fora do callback de onAuthStateChange: chamar o Supabase lá dentro pode travar o cliente.
  useEffect(() => {
    if (!userId) return
    let alive = true
    supabase.from('profiles').select('id, full_name, email, role').eq('id', userId).maybeSingle()
      .then(({ data }) => alive && setLoaded({ userId, profile: data ?? null }))
    return () => { alive = false }
  }, [userId])

  const profile = !userId ? null : loaded.userId === userId ? loaded.profile : undefined
  const loading = session === undefined || profile === undefined

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut: () => supabase.auth.signOut() }}>
      {children}
    </AuthContext.Provider>
  )
}
