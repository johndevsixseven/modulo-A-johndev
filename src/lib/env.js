// Lê as variáveis VITE_* e aplica o padrão quando estão vazias (ver .env.example).
const raw = import.meta.env

const str = (v, def) => (v == null || String(v).trim() === '' ? def : String(v).trim())
const bool = (v, def) => {
  const s = str(v, '')
  return s === '' ? def : s.toLowerCase() === 'true'
}
const num = (v, def) => {
  const n = Number(str(v, ''))
  return Number.isFinite(n) && n > 0 ? n : def
}

export const env = {
  supabaseUrl: str(raw.VITE_SUPABASE_URL, ''),
  supabaseAnonKey: str(raw.VITE_SUPABASE_ANON_KEY, ''),
  enableAI: bool(raw.VITE_ENABLE_AI, true),
  enableMaps: bool(raw.VITE_ENABLE_MAPS, true),
  mapTileUrl: str(raw.VITE_MAP_TILE_URL, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  nominatimUrl: str(raw.VITE_NOMINATIM_URL, 'https://nominatim.openstreetmap.org'),
  pollingMs: num(raw.VITE_POLLING_MS, 15000),
}

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)
