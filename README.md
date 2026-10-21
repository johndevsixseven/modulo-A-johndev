# SENN AI-X — Gestão Logística de Última Milha

Sistema web para a operação de entregas de última milha da SENN AI-X (SENAI Dev Experience 2026 — Módulo A): cadastros de frota, motoristas e pedidos, roteirização com janelas e capacidade, rastreamento em tempo real, comprovante de entrega (POD), previsão de demanda, risco de atraso, alertas, dashboard com exportação, análise inteligente e chatbot — com IA opcional e fallback local para tudo.

Manual do usuário por perfil: [`docs/MANUAL.md`](docs/MANUAL.md) · Checklist de entrega: [`docs/ENTREGA.md`](docs/ENTREGA.md) · Plano técnico e decisões: [`PLANO.md`](PLANO.md)

---

## 1. Stack e dependências

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 + Vite 8 (JavaScript), React Router 7 |
| Back-end | Supabase: Postgres + RLS, Auth, Storage (bucket privado `pod`), Realtime, Edge Functions (Deno) |
| Mapas | Leaflet + react-leaflet + tiles OpenStreetMap; geocodificação Nominatim (sem chave) |
| Gráficos / exportação | Recharts · jsPDF + jspdf-autotable (PDF) · SheetJS/xlsx (Excel) |
| CSV | PapaParse |
| IA | Edge Function `ai` → qualquer API compatível com OpenAI `/chat/completions` (padrão: **Google Gemini `gemini-2.5-flash`**) |
| Qualidade | `oxlint` (lint), `node --test` (testes unitários das funções puras) |

Requisitos: **Node.js 20+** (testado com Node 24), npm, uma conta gratuita em [supabase.com](https://supabase.com). Chave de IA é opcional.

## 2. Instalação passo a passo

> **Windows PowerShell:** use `npx.cmd` no lugar de `npx` (o `npx.ps1` costuma ser bloqueado pela política de execução). No Git Bash, macOS ou Linux use `npx` normalmente.

```bash
git clone <url-do-repositorio> && cd modulo-a
npm install

# 1) Variáveis do front-end
cp .env.example .env                                   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
# 2) Segredos das Edge Functions / scripts
cp supabase/functions/.env.example supabase/functions/.env   # chave de IA (opcional) e service_role

# 3) Supabase (projeto remoto)
npx supabase login
npx supabase link --project-ref <ref-do-projeto>       # o ref está na URL do painel: supabase.com/dashboard/project/<ref>
npx supabase db push                                   # aplica as migrations (schema, RLS, funções)
npx supabase db push --include-seed                    # (ou rode supabase/seed.sql no SQL Editor) dados de demonstração
npx supabase functions deploy ai send-alerts admin-users
npx supabase secrets set --env-file supabase/functions/.env

# 4) Usuários de teste (1 por perfil)
node scripts/seed-users.mjs

# 5) Rodar
npm run dev            # http://localhost:5173
```

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` / `npm run preview` | Build de produção em `dist/` / servir o build |
| `npm run lint` | Lint com oxlint |
| `npm test` | Testes unitários (`src/lib/*.test.js`: roteirização, previsão, risco, insights, CSV, simulação) |
| `node scripts/seed-users.mjs` | Cria/atualiza os 4 usuários de teste |
| `node scripts/backup.mjs` | Backup JSON de todas as tabelas em `backups/AAAA-MM-DD/` |
| `npx supabase functions serve --env-file supabase/functions/.env` | Edge Functions locais (requer Docker) |
| `npx supabase db dump -f backups/schema.sql` | Dump do schema (SQL) |

## 3. Variáveis de ambiente

Nunca coloque segredos em variáveis `VITE_*`: elas vão para o bundle do navegador. Os arquivos `.env` estão no `.gitignore`; só os `.env.example` são versionados.

**`.env` (front-end, público)** — modelo em [`.env.example`](.env.example)

| Variável | Uso | Onde obter / padrão |
|---|---|---|
| `VITE_SUPABASE_URL` | URL do projeto | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Chave pública anon/publishable (o RLS protege os dados) | Project Settings → API Keys |
| `VITE_ENABLE_AI` | `false` desliga as chamadas de IA (tudo em cálculo local) | padrão `true` |
| `VITE_ENABLE_MAPS` | `false` troca o mapa por tabela com coordenadas | padrão `true` |
| `VITE_MAP_TILE_URL` | Servidor de tiles | padrão OpenStreetMap |
| `VITE_NOMINATIM_URL` | Geocodificação | padrão Nominatim público (1 req/s) |
| `VITE_POLLING_MS` | Intervalo do polling quando o Realtime cai | padrão 15000 |

**`supabase/functions/.env` (servidor, secreto)** — modelo em [`supabase/functions/.env.example`](supabase/functions/.env.example)

| Variável | Uso |
|---|---|
| `AI_PROVIDER` | `gemini` \| `openai` \| `openai_compatible` \| `none` (`none` força o fallback) |
| `AI_API_KEY` | Chave do provedor. Padrão Gemini: chave `AIza...` do Google AI Studio (aistudio.google.com → Get API key), definida com `npx supabase secrets set` |
| `AI_MODEL` | Ex.: `gemini-2.5-flash`, `gpt-4o-mini` (vazio = padrão do provedor) |
| `AI_BASE_URL` | Endpoint compatível com OpenAI (vazio = padrão do provedor; use para Groq, OpenRouter, Ollama…) |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO` | E-mail de alertas (opcional) |
| `SUPABASE_SERVICE_ROLE_KEY` | Só para os scripts locais (`seed-users`, `backup`). Já é injetada nas Edge Functions. Ignora RLS: nunca expor |
| `ALLOWED_ORIGIN` | Origem permitida no CORS das funções (vazio = `*`) |

## 4. Usuários de teste

`node scripts/seed-users.mjs` cria um usuário por perfil e grava as senhas geradas em **`scripts/test-users.local.json`** (fora do Git — as senhas não ficam neste README). O script é reexecutável e reaproveita as senhas.

| Perfil | E-mail | Tela inicial |
|---|---|---|
| Administrador | `admin@senn-aix.test` | `/dashboard` |
| Gestor de frota | `gestor@senn-aix.test` | `/frota` |
| Despachante | `despachante@senn-aix.test` | `/despacho` |
| Motorista | `motorista@senn-aix.test` (vinculado ao motorista fictício “Marcos Teixeira”) | `/motorista` |

No login, escolha o **perfil** correspondente: se não bater com o perfil do usuário, o acesso é recusado.

## 5. Arquitetura

```
Navegador (React SPA)  ──supabase-js (JWT do usuário)──▶  Postgres + RLS  (tabelas, RPCs, triggers)
   │  lib/ funções puras (routing, forecast, risk,         ▲ Realtime (WebSocket) / polling de fallback
   │  insights, chatFallback) = fallback local              │
   └──functions.invoke──▶ Edge Function ai ──▶ API de IA (Gemini/OpenAI/compatível)
                          Edge Function send-alerts ──▶ Resend (e-mail)
                          Edge Function admin-users ──▶ Auth Admin API (só admin)
```

- O front fala com o banco **sempre com o JWT do usuário**: o RLS decide o que cada perfil lê/escreve. O menu e as rotas por perfil (React) só escondem; quem garante é o banco.
- Cálculos pesados ficam no banco (`dashboard_kpis`, `demand_history`, `check_alerts`) ou em funções puras testáveis em `src/lib/`.
- Chaves de IA, Resend e service_role ficam só no servidor (Edge Functions).

### Estrutura de pastas

```
modulo-a/
├─ README.md · PLANO.md · docs/ (MANUAL.md, ENTREGA.md)
├─ .env.example · vite.config.js · index.html
├─ public/exemplo-pedidos.csv        modelo de importação
├─ scripts/ seed-users.mjs · backup.mjs
├─ src/
│  ├─ App.jsx (rotas por perfil) · main.jsx · index.css (tokens, foco, responsivo)
│  ├─ auth/        AuthProvider, RequireRole, perfis
│  ├─ components/  Layout, DataTable, ConfirmDialog, Field, RouteMap, RouteStops, EntregaPod,
│  │               ChatHelper, DemandForecast, ImportarPedidos
│  ├─ lib/         supabase, env, ai, routing, forecast, risk, insights, chatFallback,
│  │               live (Realtime+polling), track (simulação), export (PDF/Excel), csv, geocode
│  └─ pages/       Login, Dashboard, Veiculos, Motoristas, Pedidos, Roteirizacao, Rastreamento,
│                  MotoristaHome, Previsao, Riscos, Alertas, Usuarios, AdminDados, Privacidade
└─ supabase/
   ├─ migrations/  schema · rls · functions (RPCs, triggers, alertas, LGPD, realtime)
   ├─ seed.sql     veículos, motoristas e histórico de entregas fictícios
   └─ functions/   ai · send-alerts · admin-users · _shared/cors.ts
```

### Telas e perfis

| Rota | Tela | Perfis |
|---|---|---|
| `/login` | Login (e-mail, senha, perfil) | público |
| `/privacidade` | Aviso de privacidade (LGPD) | público |
| `/dashboard` | KPIs, gráficos, exportação PDF/Excel, Análise Inteligente | admin, gestor, despachante |
| `/frota` · `/despacho` | Painéis do gestor e do despachante | gestor / despachante (+admin) |
| `/veiculos` · `/motoristas` · `/pedidos` | Cadastros (pedidos com importação CSV) | equipe (escrita conforme a matriz do PLANO.md §3) |
| `/roteirizacao` | Gerar, revisar e liberar rotas | admin, despachante |
| `/rastreamento` | Mapa em tempo real | admin, gestor, despachante |
| `/previsao` · `/riscos` · `/alertas` | Previsão de demanda, risco de atraso, alertas | admin, gestor, despachante |
| `/motorista` | Minha rota, iniciar rota, posição/simulação, comprovante de entrega | motorista (+admin) |
| `/usuarios` | Usuários e perfis | admin |
| `/admin/dados` | Backup JSON e LGPD (anonimizar/excluir/retenção) | admin |
| (botão flutuante) | Chatbot “SENN AI-X Helper” | todos logados |

## 6. Endpoints

Todos exigem `Authorization: Bearer <JWT do usuário>` (o `supabase-js` envia automaticamente).

| Endpoint | Entrada | Saída |
|---|---|---|
| `POST /functions/v1/ai` | `{ action, payload }` — `action` ∈ `forecast`, `risk`, `insights`, `chat`, `route_explain` | `{ ok: true, source: 'ia', data }` ou `{ ok: false, error }` |
| `POST /functions/v1/send-alerts` | — | envia por e-mail os alertas abertos alta/média ainda não enviados; sem Resend → `{ skipped: true }` |
| `POST /functions/v1/admin-users` | `{ action: list \| create \| update \| deactivate \| activate, ... }` | gestão de usuários (só admin) |
| RPC `dashboard_kpis(p_from, p_to, p_region)` | período e região | OTD, custo/entrega, km, ocupação, séries |
| RPC `demand_history(dias)` | — | entregas por região e dia (base da previsão) |
| RPC `release_route(id)` · `start_route(id)` | rota | libera / inicia a rota (atualiza veículo e entregas) |
| RPC `check_alerts()` | — | gera alertas (atraso, parado, fora da rota, manutenção, CNH, risco) |
| RPC `anonymize_driver(p)` · `anonymize_delivery(p)` · `lgpd_retention(p_days)` | id / dias | LGPD (só admin) |

## 7. Inteligência artificial

- **Modelo padrão:** Google **Gemini `gemini-2.5-flash`** pelo endpoint compatível com OpenAI (`https://generativelanguage.googleapis.com/v1beta/openai/`). Troca de provedor só por variável (`AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`) — sem alterar código.
- **Integração:** o front chama `callAI(action, payload, fallbackFn)` (`src/lib/ai.js`) → `supabase.functions.invoke('ai')` → a Edge Function valida o JWT e o perfil, monta o prompt da ação, chama `POST {AI_BASE_URL}chat/completions` com `temperature: 0.2`, `response_format: json_object` e timeout de 20 s, valida o JSON e devolve. A chave nunca chega ao navegador.
- **Privacidade:** o front envia agregados já calculados (sem nome/telefone de destinatários); payload limitado a 60 kB.
- A UI mostra o selo **“Gerado por IA”** ou **“Cálculo local”**.

**Prompt de sistema (base, comum a todas as ações):** “Você é o assistente analítico da SENN AI-X, operadora de logística de última milha. Responda somente com base nos dados fornecidos, em português do Brasil, de forma objetiva. Não invente números. Responda apenas com um objeto JSON válido, sem markdown, no formato: `<formato da ação>`. Tarefa: `<tarefa da ação>`.”

| Ação | Tarefa (resumo do prompt) | JSON esperado |
|---|---|---|
| `forecast` (RF08) | Refinar a previsão por região a partir do histórico diário e da previsão local | `{regioes:[{regiao, d7[7], d30_total, tendencia, comentario}]}` |
| `risk` (RF09) | Explicar o risco de cada entrega crítica e sugerir ações | `{itens:[{id, explicacao, acoes[]}]}` (`replanejar`, `priorizar`, `contatar_cliente`, `trocar_veiculo`) |
| `insights` (RF12) | Analisar indicadores, gargalos, regiões de maior custo, recomendações | `{resumo, gargalos[], regioes_custo[], recomendacoes[]}` |
| `chat` (RF13) | Responder sobre entregas, indicadores e telas usando o contexto; até 3 links do catálogo de telas | `{resposta, acoes:[{rotulo, rota}]}` |
| `route_explain` (RF05) | Explicar as rotas geradas (km, carga, janelas, não alocados) | `{texto}` |

## 8. Roteirização (RF05)

Heurística local em [`src/lib/routing.js`](src/lib/routing.js) — sem IA e sem internet (testada em `routing.test.js`):

1. **Custos:** distância = haversine × `fator_rua` (1,3); tempo = distância ÷ `vel_media_kmh` (25 km/h) + `tempo_parada_min` (5 min) por parada. Parâmetros em `settings.roteirizacao`; origem/destino = depósito (`settings.deposito`).
2. **Construção (vizinho mais próximo com restrições):** cada veículo (o de menor custo/km primeiro) parte do depósito e escolhe como próxima parada a que pode ser atendida mais cedo (deslocamento + espera até o início da janela), com peso por prioridade, **somente** entre as que cabem na **capacidade** (kg e m³), na **janela** de entrega (chegada ≤ fim da janela; espera se chegar antes) e na **autonomia** (rota + volta ao depósito).
3. **Melhoria 2-opt:** inverte trechos da sequência enquanto a distância total cai **e** todas as janelas/autonomia continuam válidas.
4. **Não alocados:** pedidos que sobram aparecem com o motivo (sem coordenada, capacidade, janela, autonomia, sem veículo).
5. **Saída por rota:** paradas ordenadas com ETA, km, tempo, custo estimado (`km × cost_per_km`), carga × capacidade e geometria para o mapa. “Salvar e liberar” grava `routes`/`deliveries` e chama `release_route`.

Complexidade O(n²) por rota (2-opt iterativo), adequada a centenas de pedidos no navegador. A IA (`route_explain`) só explica o resultado.

## 9. Previsão, risco, alertas e KPIs

- **Previsão (RF08, `forecast.js`):** por região, média móvel de 28 dias × fator do dia da semana (média do dia ÷ média geral); 7 valores diários + total de 30 dias. IA pode refinar.
- **Risco (RF09, `risk.js`):** pontuação 0–100 por regras (ETA após o fim da janela, pouca folga, sem rota perto da janela, prioridade urgente, veículo com problema, taxa de falha da região, distância); baixo < 30, médio 30–59, crítico ≥ 60. Pesos: janela já estourada/ETA após o fim +50; folga < 30 min +25 (< 60 min +10); sem rota e janela em < 2 h +20; urgente +10; veículo parado/em manutenção +15; > 20 km do depósito +10; taxa de falha da região × 30 (limitado a 100). Críticos geram alerta `risco_alto`.
- **Alertas (RF11):** `check_alerts()` (atraso, veículo parado, fora da rota, manutenção, CNH a vencer, risco alto) + painel em tempo real + e-mail opcional via Resend; tudo registrado em `notification_log`. Limites editáveis em `settings.alertas`.
- **KPIs (RF10):** OTD = entregues dentro da janela ÷ finalizadas (entregue + falha); custo/entrega = Σ(km planejado × custo/km do veículo) ÷ finalizadas; km = Σ `total_km` das rotas em andamento/concluídas; ocupação = Σ peso nas rotas ÷ Σ capacidade dos veículos usados.

## 10. Fallbacks (RNF06)

| Componente | Falha detectada por | Comportamento |
|---|---|---|
| IA | `VITE_ENABLE_AI=false`, `AI_PROVIDER=none`, sem chave, timeout, HTTP ≠ 200, JSON inválido | `forecast.js`, `risk.js`, `insights.js`, `chatFallback.js`; selo “Cálculo local” |
| Roteirização | — | Já é local; IA só explica |
| Mapa | `VITE_ENABLE_MAPS=false` ou ≥ 3 erros de tiles | Aviso + lista de paradas completa (o mapa some, a informação não) |
| Geocodificação | erro/timeout do Nominatim | Lat/lng digitados; linha do CSV marcada “sem coordenada” |
| Tempo real | canal Realtime ≠ `SUBSCRIBED` | Polling a cada `VITE_POLLING_MS`, com indicador na tela |
| E-mail | sem `RESEND_API_KEY` ou erro | Alerta só no painel; `notification_log` registra |

## 11. Segurança (RNF01)

- Supabase Auth (senha com hash, JWT). Não há autocadastro: só o admin cria usuários e define perfis (Edge Function `admin-users`).
- **RLS em todas as tabelas e no Storage**, seguindo a matriz perfil × recurso (PLANO.md §3). `profiles.role` só é alterável pelo admin. RPCs revogadas de `anon`; as de LGPD recusam quem não é admin (erro 42501).
- Edge Functions validam o JWT e o perfil; CORS configurável (`ALLOWED_ORIGIN`); autenticação por header Bearer (não cookie → sem CSRF).
- Sem SQL concatenado (só supabase-js e RPCs parametrizadas). React escapa a saída; nenhuma resposta da IA é renderizada como HTML.
- Comprovantes no bucket privado `pod`, abertos por URL assinada.

## 12. LGPD (RNF08)

- **Finalidade e consentimento** registrados no cadastro de motoristas (`consent_at`, `consent_purpose`) e de entregas (`consent`, `purpose`). Aviso de privacidade público em `/privacidade` (link no login e no rodapé).
- **Minimização:** só os campos necessários; a IA recebe agregados sem nome/telefone.
- **Tela `/admin/dados` (só admin):** buscar motorista ou destinatário → **Anonimizar** (RPC `anonymize_driver` / `anonymize_delivery`; para entregas, apaga antes os arquivos do comprovante no Storage) ou **Excluir** definitivamente — sempre com confirmação que nomeia o registro. **Retenção:** “Aplicar retenção (90 dias)” (`lgpd_retention`) anonimiza destinatários de entregas finalizadas há mais de 90 dias. A anonimização mantém região, status e coordenadas arredondadas, então os KPIs continuam corretos.
- Backups ficam fora do Git (`backups/` no `.gitignore`).

## 13. Backup e restauração (RNF05)

Frequência recomendada: **diária** (agendador do sistema) e antes de cada demonstração. RPO 24 h.

| Tipo | Como |
|---|---|
| JSON por tabela (script) | `node scripts/backup.mjs` → `backups/AAAA-MM-DD/<tabela>.json` (usa a service_role de `supabase/functions/.env`, pagina de 1000 em 1000) |
| JSON pela interface | `/admin/dados` → “Exportar backup (JSON)” (o que o admin enxerga, até 10 mil linhas por tabela) |
| SQL (schema + dados) | `npx supabase db dump -f backups/schema.sql` e `npx supabase db dump --data-only -f backups/data.sql` (pede a senha do banco; pode usar a variável `SUPABASE_DB_PASSWORD`) |
| Automático do Supabase | O painel (Database → Backups) mantém backups diários conforme o plano; restauração pelo próprio painel (Point-in-Time no plano pago) |

Agendar no Windows: `schtasks /create /sc daily /st 02:00 /tn "SENN backup" /tr "node C:\caminho\modulo-a\scripts\backup.mjs"` (ou `cron` no Linux).

**Restauração**
1. Projeto novo (ou banco limpo): `npx supabase link --project-ref <novo-ref>` e `npx supabase db push` (recria schema, RLS e funções).
2. Dados: `psql "<connection string do painel: Project Settings → Database>" -f backups/data.sql`.
3. Alternativa a partir dos JSON: inserir os arquivos na ordem das dependências (`vehicles` → `drivers` → `routes` → `deliveries` → `pods` → `vehicle_positions` → `alerts` → `notification_log` → `settings`) com um script usando `supabase.from(tabela).upsert(json)` e a service_role. `profiles` depende de `auth.users`: recrie os usuários (`node scripts/seed-users.mjs` ou tela Usuários) antes.
4. Local: `npx supabase db reset` recria o banco local com migrations + seed.

## 14. Acessibilidade e desempenho (RNF02, RNF03)

- Link “Pular para o conteúdo”, foco visível, navegação por teclado, diálogos nativos (`<dialog>`: foco preso, Esc fecha), labels visíveis, status com texto além da cor, tabelas com `<th scope>`, layout responsivo (375 px+), mensagens de erro com ação de recuperação.
- KPIs agregados no banco (RPC), índices nas colunas de filtro, `select` só das colunas usadas, bibliotecas de exportação carregadas sob demanda, roteirização sem chamadas de rede. Páginas carregadas sob demanda com `React.lazy` (bundle inicial ≈ 490 kB, 142 kB gzip; mapa, gráficos, PDF e Excel em chunks separados).

## 15. Rastreabilidade RF/RNF → implementação

| Requisito | Onde está |
|---|---|
| RF01 Login e perfis | `pages/Login.jsx`, `auth/`, `pages/Usuarios.jsx`, função `admin-users`, RLS (`migrations/*_rls.sql`) |
| RF02 Veículos | `pages/Veiculos.jsx`, tabela `vehicles` |
| RF03 Motoristas | `pages/Motoristas.jsx`, tabela `drivers` (vínculo único com veículo, consentimento) |
| RF04 Pedidos + CSV | `pages/Pedidos.jsx`, `components/ImportarPedidos.jsx`, `lib/csv.js`, `lib/geocode.js`, `public/exemplo-pedidos.csv` |
| RF05 Roteirização | `lib/routing.js` (+ teste), `pages/Roteirizacao.jsx`, `components/RouteMap.jsx`/`RouteStops.jsx`, RPC `release_route` |
| RF06 Rastreamento | `pages/Rastreamento.jsx`, `pages/MotoristaHome.jsx` (posição/simulação), `lib/live.js`, `lib/track.js` |
| RF07 Comprovante (POD) | `components/EntregaPod.jsx`, bucket `pod`, trigger em `pods` |
| RF08 Previsão | `lib/forecast.js` (+ teste), `pages/Previsao.jsx`, `components/DemandForecast.jsx`, RPC `demand_history`, IA `forecast` |
| RF09 Risco | `lib/risk.js` (+ teste), `pages/Riscos.jsx`, IA `risk`, alerta `risco_alto` |
| RF10 Dashboard + exportação | `pages/Dashboard.jsx`, RPC `dashboard_kpis`, `lib/export.js` |
| RF11 Alertas | RPC `check_alerts` + triggers, `pages/Alertas.jsx`, `lib/useAlerts.js`, função `send-alerts`, `notification_log` |
| RF12 Análise inteligente | `lib/insights.js` (+ teste), IA `insights`, seção “Análise Inteligente” em `/dashboard` |
| RF13 Chatbot | `components/ChatHelper.jsx`, `lib/chatFallback.js`, IA `chat` |
| RNF01 Segurança | RLS, Auth, Edge Functions com JWT, seção 11 |
| RNF02 Desempenho | RPCs agregadas, índices, carregamento sob demanda |
| RNF03 Usabilidade/acessibilidade | `index.css` (tokens AA, foco), `Layout.jsx` (skip link, menu responsivo), `ConfirmDialog`, `DataTable` |
| RNF04 Tempo real | Supabase Realtime + polling (`lib/live.js`) |
| RNF05 Backup | `scripts/backup.mjs`, botão em `/admin/dados`, `supabase db dump`, seção 13 |
| RNF06 Fallback | `lib/ai.js` + funções locais, seção 10 |
| RNF07 Modularidade | `lib/` puras e testadas, `pages/` por domínio, IA isolada e trocável por variável, migrations separadas |
| RNF08 LGPD | `pages/AdminDados.jsx`, `pages/Privacidade.jsx`, RPCs de anonimização/retenção, consentimento nos cadastros |
| RNF09 Manual | [`docs/MANUAL.md`](docs/MANUAL.md) |

## 16. Decisões sobre ambiguidades do enunciado

Resumo (detalhes em `PLANO.md` §0): só o admin cria usuários e define perfis; o login compara o perfil escolhido com o do banco; status de entrega `pendente → planejada → a_caminho → entregue/falha` (+ `cancelada`); limites de alertas editáveis em `settings`; risco por regras determinísticas com IA só explicando; um único depósito (CD) como origem das rotas; posição do motorista a cada 10 s com meta < 3 s no painel; backup diário (RPO 24 h).
