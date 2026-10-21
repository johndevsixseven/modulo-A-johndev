// Traduz erros do PostgREST para mensagens com ação de recuperação. `unique` = texto para violação de unicidade.
export function dbMessage(error, unique = 'Já existe um registro com esses dados.') {
  if (!error) return ''
  if (error.code === '23505') return unique
  if (error.code === '42501') return 'Seu perfil não tem permissão para esta ação. Fale com o administrador se precisar dela.'
  if (error.code === '23514' || error.code === '22P02') return 'Algum valor não foi aceito pelo servidor. Confira os campos e tente de novo.'
  if (/fetch|network/i.test(error.message ?? '')) return 'Não conseguimos falar com o servidor. Verifique a conexão e tente de novo.'
  return 'Não conseguimos concluir a operação. Tente de novo em instantes.'
}
