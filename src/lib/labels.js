// Rótulos dos enums (supabase/migrations/20261021120000_schema.sql) e datas no fuso de Brasília.
export const VEHICLE_TYPES = {
  moto: 'Moto', carro: 'Carro', utilitario: 'Utilitário', van: 'Van',
  caminhao_leve: 'Caminhão leve', caminhao_medio: 'Caminhão médio',
}
export const VEHICLE_STATUS = { disponivel: 'Disponível', em_rota: 'Em rota', em_manutencao: 'Em manutenção' }
export const DELIVERY_STATUS = {
  pendente: 'Pendente', planejada: 'Planejada', a_caminho: 'A caminho',
  entregue: 'Entregue', falha: 'Falha', cancelada: 'Cancelada',
}
export const PRIORITIES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }
export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']
export const REGIONS = ['Centro', 'Zona Norte', 'Zona Sul', 'Zona Leste', 'Zona Oeste']

const TZ = 'America/Sao_Paulo'

// 'AAAA-MM-DD' de hoje em Brasília.
export const todayBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ })

export const daysUntil = (date) => Math.round((Date.parse(date) - Date.parse(todayBR())) / 864e5)

export const formatDate = (date) => (date ? date.split('-').reverse().join('/') : '—')

export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '—'

// timestamptz → valor de <input type="datetime-local"> em Brasília (UTC−3, sem horário de verão desde 2019).
export const isoToLocalInput = (iso) => (iso ? new Date(Date.parse(iso) - 3 * 36e5).toISOString().slice(0, 16) : '')

export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—'

export const ROUTE_STATUS = {
  rascunho: 'Rascunho', liberada: 'Liberada', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
}
