// Valores iguais ao enum public.app_role (supabase/migrations/20261021120000_schema.sql).
export const ROLE_LABELS = {
  admin: 'Administrador',
  gestor_frota: 'Gestor de frota',
  despachante: 'Despachante',
  motorista: 'Motorista',
}

export const ROLES = Object.keys(ROLE_LABELS)

// Painel inicial de cada perfil (PLANO.md seção 2).
export const HOME_BY_ROLE = {
  admin: '/dashboard',
  gestor_frota: '/frota',
  despachante: '/despacho',
  motorista: '/motorista',
}
