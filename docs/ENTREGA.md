# Entrega — SENAI Dev Experience 2026 · Módulo A

## Checklist

- [ ] Repositório no GitHub criado e todo o código enviado (`git push`); `git log --oneline origin/main` mostra ≥ 3 commits descritivos.
- [ ] Acesso concedido a **Cardoso30S**, **fiorezewesley** e **Greggori** (Settings → Collaborators → Add people) — ou repositório público. Conferir se os convites foram enviados.
- [ ] Nenhum segredo versionado: `git ls-files | grep -E "\.env$|test-users|backups/"` deve sair vazio.
- [ ] `README.md` completo e `docs/MANUAL.md` presentes; revisar e remover os marcadores `<!-- CONFERIR -->`.
- [ ] Teste em pasta limpa seguindo só o README: `npm install`, `npm run build`, `npm test`, `npm run dev`.
- [ ] Teste final com os 4 perfis + fallback (`VITE_ENABLE_AI=false`, `VITE_ENABLE_MAPS=false`).
- [ ] Backup antes da apresentação: `node scripts/backup.mjs`.
- [ ] Zip **`moduloA_nomeEquipe.zip`** (trocar `nomeEquipe` pelo nome da equipe), sem `node_modules`, `dist`, `.env`, `backups/`:
      `git archive -o moduloA_nomeEquipe.zip HEAD`
- [ ] PDF final com o link do repositório e a explicação da solução (rascunho abaixo), com capturas de tela.

## Rascunho do texto do PDF

**SENN AI-X — Gestão Logística de Última Milha**
Equipe: _[nome da equipe]_ · Integrantes: _[nomes]_
Repositório: _[https://github.com/usuario/repositorio]_ (acesso: Cardoso30S, fiorezewesley, Greggori)

**1. Resumo da solução.** Aplicação web para a SENN AI-X planejar, executar e acompanhar entregas de última milha. Quatro perfis (administrador, gestor de frota, despachante e motorista) com permissões garantidas no banco. Cobre cadastro de veículos, motoristas e pedidos (com importação CSV), roteirização com capacidade, janelas de entrega e autonomia, rastreamento em tempo real, comprovante de entrega (foto, código ou assinatura com geolocalização), previsão de demanda, risco de atraso, alertas, dashboard com exportação PDF/Excel, análise inteligente e chatbot de ajuda.

**2. Arquitetura.** Front-end React + Vite; back-end Supabase (Postgres com Row Level Security, Auth, Storage privado, Realtime e Edge Functions). Cálculos de negócio em funções puras testadas (`src/lib`) e agregações em funções SQL. A IA é acessada só pelo servidor (Edge Function `ai`), então nenhuma chave chega ao navegador.

**3. Inteligência artificial.** Modelo padrão Google Gemini 2.5 Flash, pelo endpoint compatível com OpenAI; o provedor é trocável por variável de ambiente (OpenAI, Groq, OpenRouter, Ollama…). Cinco ações — previsão, risco, análise, chat e explicação de rotas — com prompts em português que exigem resposta em JSON validado. A IA recebe dados agregados, sem nome ou telefone. Se a IA estiver desligada, sem chave, lenta ou errar, o sistema usa o cálculo local equivalente e mostra o selo “Cálculo local”.

**4. Roteirização.** Heurística própria, sem depender de internet: vizinho mais próximo respeitando capacidade (kg e m³), janelas de entrega e autonomia do veículo, seguido de melhoria 2-opt que só aceita trocas que mantêm todas as restrições. Pedidos que não cabem aparecem com o motivo. Gera ETA, km, custo e carga por rota.

**5. Segurança e LGPD.** RLS em todas as tabelas e no Storage; perfil só alterável pelo administrador; sem autocadastro. Consentimento e finalidade registrados; aviso de privacidade público; anonimização e exclusão sob demanda e retenção de 90 dias na tela do administrador; backups fora do repositório.

**6. Confiabilidade.** Fallback para IA, mapa, geocodificação, tempo real (polling) e e-mail. Backup diário por script (JSON por tabela) e dump SQL, com restauração documentada no README.

**7. Decisões sobre ambiguidades.** Só o admin cria usuários; login confere o perfil escolhido; status de entrega pendente → planejada → a caminho → entregue/falha; limites de alerta configuráveis; risco por regras com IA explicando; um depósito central como origem das rotas.

**8. Usuários de teste.** Um por perfil (`admin@`, `gestor@`, `despachante@`, `motorista@senn-aix.test`); senhas entregues à banca separadamente. <!-- não colocar senhas no PDF público -->

**9. Capturas de tela.** Login · Dashboard · Roteirização com mapa · Rastreamento · Comprovante de entrega (celular) · Alertas · Chatbot · Dados e LGPD.
