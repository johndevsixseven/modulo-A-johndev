# Manual do usuário — SENN AI-X

Sistema de gestão de entregas de última milha. Este manual explica, por perfil, as tarefas do dia a dia. Instalação e detalhes técnicos estão no [README](../README.md).

## 1. Primeiros passos (todos os perfis)

1. Abra o endereço do sistema e preencha **e-mail**, **senha** e **perfil** (Administrador, Gestor de frota, Despachante ou Motorista).
2. Clique em **Entrar**. Se o perfil escolhido não for o seu, o sistema recusa — escolha o perfil correto.
3. Você cai na sua tela inicial. O **menu** no topo mostra só as telas do seu perfil (no celular, toque em **Menu**).
4. Para sair, clique em **Sair** no canto superior.

Dicas de uso:
- Tudo funciona pelo teclado: **Tab** avança, **Enter** confirma, **Esc** fecha janelas. O link “Pular para o conteúdo” aparece no primeiro Tab.
- Tabelas têm **busca** e cabeçalhos clicáveis para **ordenar**.
- Ações que apagam dados pedem **confirmação com o nome do item**.
- Selo **“Gerado por IA”** = texto da inteligência artificial; **“Cálculo local”** = o sistema calculou sozinho (IA desligada ou indisponível). Os dois são confiáveis.
- O botão flutuante **SENN AI-X Helper** (chat) responde dúvidas, por exemplo: “qual o status da entrega PED-0001?”, “qual o OTD da semana?”, “como importar CSV?”. As respostas trazem botões que levam à tela certa.
- O link **Aviso de privacidade (LGPD)** no rodapé e no login explica quais dados são usados e para quê.

## 2. Administrador

O administrador vê todas as telas.

**Criar usuários e perfis** — menu **Usuários**
1. No formulário **Novo usuário**, informe nome, e-mail, senha inicial e perfil e clique em **Criar usuário**.
2. Para trocar perfil ou senha, use **Editar**. Para bloquear o acesso sem perder o histórico, use **Desativar** (e **Ativar** para voltar). Você não pode desativar nem rebaixar a si mesmo.

**Dados e LGPD** — menu **Dados e LGPD**
- **Exportar backup (JSON):** baixa um arquivo com todas as tabelas. Guarde em local seguro (contém dados pessoais).
- **Retenção (90 dias):** “Aplicar retenção” anonimiza os destinatários de entregas finalizadas há mais de 90 dias.
- **Motoristas / Destinatários:** busque pelo nome ou código e escolha:
  - **Anonimizar** — troca o nome por “Anonimizado” e apaga telefone, endereço exato e arquivos de comprovante. Os indicadores continuam corretos.
  - **Excluir** — apaga o registro definitivamente.
  Confirme na janela que mostra o nome do registro. Não há como desfazer: exporte um backup antes, se precisar.

O administrador também pode fazer tudo o que os outros perfis fazem (seções abaixo).

## 3. Gestor de frota

Tela inicial: **Frota**.

**Veículos** — cadastrar placa, tipo, capacidade (kg e m³), autonomia, custo por km, status (disponível, em rota, em manutenção) e data da próxima manutenção.
**Motoristas** — cadastrar nome, CNH (categoria e validade), telefone, veículo vinculado (um veículo por motorista) e o **consentimento** com a finalidade do uso dos dados. CNH vencida ou a vencer aparece destacada.
**Dashboard** — escolha o período (hoje, 7 dias, 30 dias ou personalizado) e a região. Veja OTD (entregas no prazo), custo por entrega, km rodados e ocupação da frota. **Exportar PDF** ou **Exportar Excel** baixa os números da tela. A seção **Análise Inteligente** resume gargalos e recomendações (botão **Análise por regras** funciona sem IA).
**Previsão** — demanda prevista por região para 7 e 30 dias; “Refinar com IA” melhora a previsão quando a IA está ligada.
**Riscos** — entregas com risco de atraso (Baixo, Médio, Crítico) com motivos e ações sugeridas.
**Alertas** — atrasos, veículo parado, fora da rota, manutenção próxima, CNH a vencer e risco alto. Clique em **Marcar como resolvido** quando tratar. O número ao lado de “Alertas” no menu mostra quantos estão abertos.
**Rastreamento** — mapa com os veículos e paradas em tempo real; filtre por rota, motorista ou região. Se aparecer “Atualização a cada 15 s”, o tempo real caiu e o sistema está atualizando sozinho. O indicador normal mostra “Tempo real”.

## 4. Despachante

Tela inicial: **Despacho**.

**Pedidos**
1. **Novo pedido:** código, destinatário, telefone, endereço, região, janela de entrega (início e fim), peso, volume e prioridade. O sistema localiza o endereço no mapa; se não achar, digite latitude e longitude.
2. **Importar CSV:** use o modelo `exemplo-pedidos.csv` (link na tela). Linhas com erro aparecem com o motivo e a linha; corrija o arquivo e importe de novo.
3. Pedidos só podem ser editados ou excluídos enquanto estão **pendentes**.

**Roteirização**
1. Escolha a data, os pedidos pendentes e os veículos disponíveis.
2. Clique em **Gerar rotas**. Cada rota aparece no mapa com uma cor e na lista de paradas com horário previsto (ETA), km, custo e carga × capacidade.
3. Pedidos **não alocados** mostram o motivo (capacidade, janela, autonomia, sem coordenada). Ajuste e gere de novo.
4. Clique em **Salvar e liberar N rota(s)**: as rotas vão para os motoristas e os pedidos passam a “planejada”.

Também usa **Dashboard**, **Previsão**, **Riscos** (botões “Priorizar” e “Replanejar”), **Alertas** e **Rastreamento** como o gestor.

## 5. Motorista

Tela inicial: **Minha rota** (funciona bem no celular).

1. Veja a rota do dia no mapa e a lista de paradas na ordem, com horário previsto.
2. Toque em **Iniciar rota**. Permita o acesso à localização: o sistema envia sua posição a cada 10 segundos enquanto a rota está em andamento.
3. Em cada parada, registre o **comprovante de entrega**:
   - Resultado: **Entregue** ou **Falha** (com o motivo).
   - Método: **foto**, **código** informado pelo cliente ou **assinatura** na tela.
   - A localização e o horário são gravados automaticamente.
4. O status da entrega muda na hora para a equipe no escritório.

Modo simulação (demonstração): o botão **Simular deslocamento** move o veículo pela rota sem precisar sair do lugar (**Parar simulação** encerra).

## 6. Suporte técnico básico (FAQ)

| Problema | O que fazer |
|---|---|
| “Perfil não corresponde ao usuário” | Escolha no login o perfil que o administrador definiu para você. |
| Esqueci a senha | Peça ao administrador para definir uma nova senha em **Usuários**. |
| Não vejo uma tela no menu | Seu perfil não tem acesso. Fale com o administrador se precisar. |
| “Seu perfil não tem permissão para esta ação” | A ação é de outro perfil (ex.: só o despachante cria pedidos). |
| “Não conseguimos falar com o servidor” | Verifique a internet e tente de novo. Os dados não se perdem. |
| O mapa não aparece | A lista de paradas continua completa abaixo. Recarregue a página mais tarde. |
| Selo “Cálculo local” em vez de IA | A IA está desligada ou indisponível; os números locais são válidos. |
| “Atualização a cada 15 s” | O tempo real caiu; a tela continua se atualizando sozinha. |
| Endereço não encontrado | Digite latitude/longitude (copie do OpenStreetMap ou Google Maps). |
| CSV recusado | Confira as colunas do modelo, separador ponto e vírgula (;) ou vírgula (,) — detectado automaticamente. |
| Localização não enviada (motorista) | Permita a localização no navegador/celular e mantenha a tela aberta. |
| Pedido “não alocado” | Leia o motivo na roteirização: peso/volume acima da capacidade, janela impossível ou distância acima da autonomia. |

Ainda com problema? Contate o administrador do sistema informando a tela, o horário e a mensagem exibida (sem enviar senhas).
