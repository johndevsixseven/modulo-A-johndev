import { Link } from 'react-router-dom'

// Aviso de privacidade e finalidade (RNF08). Público: acessível também antes do login.
export default function Privacidade() {
  return (
    <main id="conteudo" className="container stack">
      <h1>Aviso de privacidade</h1>
      <p>A SENN AI-X trata dados pessoais somente para executar e acompanhar entregas de última milha, conforme a LGPD (Lei 13.709/2018).</p>
      <h2>Quais dados e para quê</h2>
      <ul>
        <li><strong>Motoristas:</strong> nome, telefone, CNH e localização do veículo durante a rota — gestão da frota, segurança e rastreamento da jornada. Coletados com consentimento e finalidade registrados no cadastro.</li>
        <li><strong>Destinatários:</strong> nome, telefone e endereço — execução da entrega contratada e contato em caso de problema.</li>
        <li><strong>Comprovantes de entrega:</strong> foto, assinatura ou código e a localização no momento da entrega — prova de entrega. Guardados em armazenamento privado, abertos só por link temporário.</li>
        <li><strong>Usuários do sistema:</strong> e-mail e perfil de acesso — autenticação e controle de permissões.</li>
      </ul>
      <h2>Como protegemos</h2>
      <ul>
        <li>Cada perfil vê só o que precisa (regras de acesso no banco de dados).</li>
        <li>A inteligência artificial recebe dados agregados ou sem nome e telefone.</li>
        <li>Dados de destinatários de entregas finalizadas são anonimizados após 90 dias.</li>
        <li>Backups ficam fora do repositório de código e em local restrito.</li>
      </ul>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção, anonimização ou exclusão dos seus dados ao administrador do sistema, que executa o pedido na tela “Dados e LGPD”.</p>
      <p><Link to="/">Voltar ao sistema</Link></p>
    </main>
  )
}
