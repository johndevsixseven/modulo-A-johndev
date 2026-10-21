# PLANO — SENN AI-X · Gestão Logística de Última Milha (Módulo A)

Stack: **React + Vite** (JavaScript) · **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) · **Leaflet + OpenStreetMap** · IA externa via Edge Function (padrão **Gemini** pelo endpoint compatível com OpenAI).

Regra geral: tudo que usa IA tem um caminho local (algoritmo/estatística/regras) que funciona sozinho. A IA só melhora o resultado; nunca é obrigatória.

---

## 0. Decisões sobre ambiguidades do enunciado

| Ambiguidade | Decisão | Motivo |
|---|---|---|
| Quem define o perfil | Só o **admin** cria usuários e define perfil (tela Usuários → Edge Function `admin-users`). Não existe autocadastro público. Trigger cria `profiles` com `motorista` por padrão; `profiles.role` só é alterável pelo admin (RLS). | Evita escalonamento de privilégio (RNF01). |
| "Login com e-mail, senha e perfil" | Tela de login tem select de perfil. Após autenticar, compara com `profiles.role`; se diferente → `signOut()` e mensagem "Perfil não corresponde ao usuário". | Atende o texto literal sem confiar no perfil vindo do cliente. |
| Permissões por perfil | Matriz da seção 3, aplicada no React (menu/rotas) **e** no banco (RLS). | Front esconde, banco garante. |
| Valores de "tipo de veículo" | `moto`, `carro`, `utilitario`, `van`, `caminhao_leve`, `caminhao_medio`. | Cobre última milha urbana. |
| Status de veículo | `disponivel`, `em_rota`, `em_manutencao` (do enunciado). | — |
| Status de entrega | `pendente`, `planejada`, `a_caminho`, `entregue`, `falha`, `cancelada`. | Enunciado cita a caminho/entregue/falha; os demais cobrem o ciclo antes da rota. |
| Colunas do CSV | Seção 7 (definido por nós, com arquivo de exemplo). | — |
| Limites dos alertas | Tabela `settings` (chave `alertas`), editável pelo admin. Padrões: atraso = agora > `window_end`; veículo parado = em rota e sem deslocar > 100 m por **20 min**; fora da rota = > **1 km** da polilinha planejada; manutenção ≤ **7 dias**; CNH ≤ **30 dias**; risco crítico ≥ **60**. | Valores razoáveis e ajustáveis sem deploy. |
| Critérios de risco | Pontuação por regras (seção RF09) de 0–100: baixo < 30, médio 30–59, crítico ≥ 60. IA explica e sugere ações. | Determinístico, testável e funciona offline. |
| Frequência de backup | Diário (script `backup.mjs` agendado) + antes de cada demonstração; backups automáticos do Supabase quando o plano oferecer. RPO 24 h. | Simples e documentável. |
| Latência do tempo real | Motorista envia posição a cada **10 s**; meta de propagação ao painel **< 3 s** (Realtime). Com polling: até `VITE_POLLING_MS` (15 s). | Mensurável no teste. |
| Depósito (origem das rotas) | Coordenada única em `settings` (chave `deposito`). | Um CD só, simples. |
| Região | Texto livre controlado (Centro, Zona Norte, Zona Sul, Zona Leste, Zona Oeste) no seed; CSV aceita qualquer nome. | Previsão é agregada por esse campo. |
| KPIs | OTD = entregues dentro da janela ÷ finalizadas (entregue+falha). Custo/entrega = Σ(km planejado × `cost_per_km` do veículo) ÷ finalizadas. Km rodados = Σ `routes.total_km` das rotas em andamento/concluídas. Ocupação = Σ peso nas rotas ÷ Σ capacidade dos veículos usados. | Fórmulas explícitas no README. |
| Prazo | Não informado: o plano prioriza o "caminho mínimo funcional" (fases 1–6) antes do polimento. | — |

---

## 1. Estrutura de pastas

Projeto Vite na **raiz** (o `.env` da raiz é lido pelo Vite).

```
modulo-a/
├─ index.html · package.json · vite.config.js · .env(.example) · .gitignore
├─ README.md                    # instalação, execução, IA, roteirização (exigido)
├─ PLANO.md
├─ docs/MANUAL_USUARIO.md       # RNF09
├─ public/exemplo-pedidos.csv   # modelo de importação
├─ scripts/
│  ├─ seed-users.mjs            # cria 1 usuário por perfil (service_role)
│  └─ backup.mjs                # exporta todas as tabelas em JSON → backups/
├─ src/
│  ├─ main.jsx · App.jsx (rotas) · index.css (tokens de cor, foco, responsivo)
│  ├─ lib/
│  │  ├─ supabase.js            # createClient com VITE_*
│  │  ├─ env.js                 # lê VITE_* com padrões quando vazios
│  │  ├─ ai.js                  # invoke('ai') + timeout + fallback
│  │  ├─ geo.js                 # haversine, distância ponto-segmento
│  │  ├─ geocode.js             # Nominatim (1 req/s) → null em erro
│  │  ├─ routing.js (+ routing.test.js)   # VRP heurístico
│  │  ├─ forecast.js (+ forecast.test.js) # média móvel + sazonalidade semanal
│  │  ├─ risk.js (+ risk.test.js)         # pontuação de risco
│  │  ├─ insights.js            # análise por regras (fallback RF12)
│  │  ├─ chatFallback.js        # respostas por palavra-chave (fallback RF13)
│  │  ├─ csv.js                 # PapaParse + validação
│  │  ├─ export.js              # jsPDF/autotable + SheetJS
│  │  └─ live.js                # useLive(): Realtime com fallback de polling
│  ├─ auth/ AuthProvider.jsx · RequireRole.jsx
│  ├─ components/ Layout.jsx · MapView.jsx · MapFallbackTable.jsx · SignaturePad.jsx · ChatHelper.jsx · KpiCard.jsx · DataTable.jsx · ConfirmDialog.jsx
│  └─ pages/ Login · Dashboard · Frota · Despacho · Usuarios · Veiculos · Motoristas · Pedidos · Roteirizacao · Rastreamento · MotoristaHome · EntregaPod · Previsao · Riscos · Alertas · Analise · AdminDados
└─ supabase/
   ├─ config.toml               # gerado por `supabase init`
   ├─ migrations/
   │  ├─ 20261021120000_schema.sql     # (0001) enums, tabelas, índices
   │  ├─ 20261021120100_rls.sql        # (0002) helpers + políticas + storage
   │  └─ 20261021120200_functions.sql  # (0003) triggers, RPCs, alertas, LGPD, realtime
   ├─ seed.sql                  # veículos, motoristas, 60 dias de histórico
   └─ functions/
      ├─ .env(.example)
      ├─ _shared/ cors.ts · auth.ts · llm.ts
      ├─ ai/index.ts            # ações: forecast | risk | insights | chat | route_explain
      ├─ send-alerts/index.ts   # e-mail via Resend + notification_log
      └─ admin-users/index.ts   # criar/excluir usuário + definir perfil (só admin)
```

---

## 2. Mapa de telas e rotas

| Rota | Tela | Perfis | RF |
|---|---|---|---|
| `/login` | Login (e-mail, senha, perfil) | público | RF01 |
| `/` | Redireciona: admin→`/dashboard`, gestor_frota→`/frota`, despachante→`/despacho`, motorista→`/motorista` | todos | RF01 |
| `/dashboard` | KPIs, gráficos, previsão resumida, exportar | admin, gestor, despachante | RF10, RF08 |
| `/frota` | Painel do gestor: ocupação, veículos por status, manutenção/CNH a vencer | admin, gestor | RF01, RF02, RF03 |
| `/despacho` | Painel do despachante: pedidos do dia por status, riscos críticos, atalho p/ roteirizar | admin, despachante | RF01, RF04, RF09 |
| `/usuarios` | CRUD usuários e perfis | admin | RF01 |
| `/veiculos` | CRUD veículos | admin, gestor (escrita); despachante (leitura) | RF02 |
| `/motoristas` | CRUD motoristas, vínculo veículo, consentimento | admin, gestor (escrita); despachante (leitura) | RF03, RNF08 |
| `/pedidos` | CRUD + importação CSV + geocodificação | admin, despachante (escrita); gestor (leitura) | RF04 |
| `/roteirizacao` | Gerar, visualizar, ajustar e liberar rotas | admin, despachante | RF05 |
| `/rastreamento` | Mapa em tempo real + filtros | admin, gestor, despachante | RF06 |
| `/motorista` | Minha rota, iniciar rota, enviar posição, modo simulação | motorista (admin p/ teste) | RF05, RF06 |
| `/motorista/entrega/:id` | POD: foto/código/assinatura + geolocalização | motorista, admin | RF07 |
| `/previsao` | Previsão 7/30 dias por região | admin, gestor, despachante | RF08 |
| `/riscos` | Lista de risco por entrega, ações sugeridas | admin, gestor, despachante | RF09 |
| `/alertas` | Painel de alertas, resolver, log de notificações | admin, gestor, despachante | RF11 |
| `/analise` | Análise Inteligente (texto + gráficos) | admin, gestor | RF12 |
| `/admin/dados` | Configurações (limites, depósito), backup JSON, LGPD (anonimizar/excluir) | admin | RNF05, RNF08 |
| (flutuante) | Chat "SENN AI-X Helper" | todos logados | RF13 |

---

## 3. Matriz de permissões (perfil × tela/ação)

L = leitura · E = escrita (criar/editar/excluir) · P = próprio registro · — = sem acesso

| Recurso | admin | gestor_frota | despachante | motorista |
|---|---|---|---|---|
| Usuários / perfis | E | — | — | — |
| Veículos | E | E | L | P (L do próprio) |
| Motoristas | E | E | L | P (L) |
| Pedidos / entregas | E | L | E | P (L das suas rotas) |
| Roteirização / liberar rota | E | L | E | P (L + iniciar) |
| Rastreamento (mapa) | L | L | L | P (envia posição) |
| POD (comprovante) | E | L | L | P (cria nas suas entregas) |
| Dashboard / exportar | L | L | L | — |
| Previsão / Riscos | L | L | L | — |
| Alertas (ver/resolver) | E | E | E | — |
| Análise Inteligente | L | L | — | — |
| Chatbot | sim | sim | sim | sim (RLS limita a resposta) |
| Configurações, backup, LGPD | E | — | — | — |

---

## 4. Schema SQL planejado

### 4.1 `supabase/migrations/0001_schema.sql`

```sql
create extension if not exists pgcrypto;

create type app_role        as enum ('admin','gestor_frota','despachante','motorista');
create type vehicle_type    as enum ('moto','carro','utilitario','van','caminhao_leve','caminhao_medio');
create type vehicle_status  as enum ('disponivel','em_rota','em_manutencao');
create type delivery_status as enum ('pendente','planejada','a_caminho','entregue','falha','cancelada');
create type priority_level  as enum ('baixa','normal','alta','urgente');
create type route_status    as enum ('rascunho','liberada','em_andamento','concluida','cancelada');
create type pod_method      as enum ('foto','codigo','assinatura');
create type alert_type      as enum ('entrega_atrasada','veiculo_parado','fora_da_rota','manutencao_vencendo','cnh_vencendo','risco_alto');
create type alert_severity  as enum ('baixa','media','alta');
create type alert_status    as enum ('aberto','resolvido');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role app_role not null default 'motorista',
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),  -- antiga e Mercosul
  type vehicle_type not null,
  capacity_kg numeric(10,2) not null check (capacity_kg > 0),
  capacity_m3 numeric(10,3) not null check (capacity_m3 > 0),
  range_km numeric(10,1) not null check (range_km > 0),
  cost_per_km numeric(10,2) not null default 1.50,
  status vehicle_status not null default 'disponivel',
  next_maintenance date,
  last_lat double precision, last_lng double precision,
  last_seen_at timestamptz, last_moved_at timestamptz,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  name text not null,
  cnh_category text not null check (cnh_category in ('A','B','C','D','E','AB','AC','AD','AE')),
  cnh_expiry date not null,
  phone text,
  available boolean not null default true,
  vehicle_id uuid unique references vehicles(id) on delete set null,
  consent_at timestamptz,               -- LGPD
  consent_purpose text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now()
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  route_date date not null default current_date,
  vehicle_id uuid references vehicles(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  status route_status not null default 'rascunho',
  total_km numeric(10,2) not null default 0,
  total_min integer not null default 0,
  est_cost numeric(10,2) not null default 0,
  load_kg numeric(10,2) not null default 0,
  geometry jsonb not null default '[]',   -- [[lat,lng], ...] depósito → paradas → depósito
  ai_notes text,                           -- explicação opcional da IA
  released_at timestamptz, started_at timestamptz, finished_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  recipient_name text not null,
  recipient_phone text,
  address text not null,
  region text not null,
  lat double precision, lng double precision,
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  weight_kg numeric(10,2) not null check (weight_kg > 0),
  volume_m3 numeric(10,3) not null check (volume_m3 > 0),
  priority priority_level not null default 'normal',
  status delivery_status not null default 'pendente',
  route_id uuid references routes(id) on delete set null,
  stop_order integer,
  eta timestamptz,
  delivered_at timestamptz,
  risk_score integer, risk_level text, risk_reasons jsonb, risk_actions jsonb,
  consent boolean not null default false,  -- LGPD: consentimento do destinatário
  purpose text not null default 'Execução da entrega contratada',
  anonymized_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table vehicle_positions (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  lat double precision not null, lng double precision not null,
  speed_kmh numeric(6,1),
  recorded_at timestamptz not null default now()
);

create table pods (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references deliveries(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  result delivery_status not null check (result in ('entregue','falha')),
  failure_reason text,
  method pod_method,
  photo_path text, signature_path text, code text,
  lat double precision, lng double precision,
  recorded_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  type alert_type not null,
  severity alert_severity not null default 'media',
  title text not null,
  message text not null,
  delivery_id uuid references deliveries(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  status alert_status not null default 'aberto',
  emailed_at timestamptz,
  resolved_at timestamptz, resolved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table notification_log (
  id bigint generated always as identity primary key,
  alert_id uuid references alerts(id) on delete set null,
  channel text not null check (channel in ('painel','email')),
  recipient text,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Índices (RNF02)
create index on deliveries (status);
create index on deliveries (region, created_at);
create index on deliveries (route_id, stop_order);
create index on deliveries (window_end) where status in ('pendente','planejada','a_caminho');
create index on routes (route_date, status);
create index on routes (driver_id);
create index on vehicle_positions (vehicle_id, recorded_at desc);
create index on alerts (status, created_at desc);
create index on alerts (type, delivery_id, vehicle_id, driver_id) where status = 'aberto';
```

### 4.2 `supabase/migrations/0002_rls.sql`

```sql
-- Helpers (security definer evita recursão de RLS em profiles)
create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(auth_role() in ('admin','gestor_frota','despachante'), false) $$;

create or replace function my_driver_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from drivers where profile_id = auth.uid() $$;

create or replace function my_vehicle_id() returns uuid
language sql stable security definer set search_path = public as
$$ select vehicle_id from drivers where profile_id = auth.uid() $$;

alter table profiles          enable row level security;
alter table vehicles          enable row level security;
alter table drivers           enable row level security;
alter table routes            enable row level security;
alter table deliveries        enable row level security;
alter table vehicle_positions enable row level security;
alter table pods              enable row level security;
alter table alerts            enable row level security;
alter table notification_log  enable row level security;
alter table settings          enable row level security;

-- profiles: cada um lê o seu; equipe lê todos; só admin altera (perfil)
create policy profiles_sel on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_upd on profiles for update using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy profiles_del on profiles for delete using (auth_role() = 'admin');

-- vehicles
create policy veh_sel on vehicles for select using (is_staff() or id = my_vehicle_id());
create policy veh_ins on vehicles for insert with check (auth_role() in ('admin','gestor_frota'));
create policy veh_upd on vehicles for update using (auth_role() in ('admin','gestor_frota'));
create policy veh_del on vehicles for delete using (auth_role() in ('admin','gestor_frota'));

-- drivers
create policy drv_sel on drivers for select using (is_staff() or profile_id = auth.uid());
create policy drv_ins on drivers for insert with check (auth_role() in ('admin','gestor_frota'));
create policy drv_upd on drivers for update using (auth_role() in ('admin','gestor_frota'));
create policy drv_del on drivers for delete using (auth_role() in ('admin','gestor_frota'));

-- routes (motorista só lê as suas; iniciar rota é via RPC start_route)
create policy rt_sel on routes for select using (is_staff() or driver_id = my_driver_id());
create policy rt_ins on routes for insert with check (auth_role() in ('admin','despachante'));
create policy rt_upd on routes for update using (auth_role() in ('admin','despachante'));
create policy rt_del on routes for delete using (auth_role() in ('admin','despachante'));

-- deliveries (motorista lê as das suas rotas; status muda pelo trigger do POD)
create policy del_sel on deliveries for select using (
  is_staff() or route_id in (select id from routes where driver_id = my_driver_id()));
create policy del_ins on deliveries for insert with check (auth_role() in ('admin','despachante'));
create policy del_upd on deliveries for update using (auth_role() in ('admin','despachante'));
create policy del_del on deliveries for delete using (auth_role() in ('admin','despachante'));

-- vehicle_positions: motorista grava só o próprio veículo
create policy pos_sel on vehicle_positions for select using (is_staff() or vehicle_id = my_vehicle_id());
create policy pos_ins on vehicle_positions for insert with check (
  vehicle_id = my_vehicle_id() or auth_role() = 'admin');

-- pods
create policy pod_sel on pods for select using (is_staff() or driver_id = my_driver_id());
create policy pod_ins on pods for insert with check (
  auth_role() = 'admin' or (driver_id = my_driver_id() and delivery_id in (
    select d.id from deliveries d join routes r on r.id = d.route_id where r.driver_id = my_driver_id())));

-- alerts / log / settings
create policy al_sel on alerts for select using (is_staff());
create policy al_ins on alerts for insert with check (is_staff());
create policy al_upd on alerts for update using (is_staff());
create policy nl_sel on notification_log for select using (is_staff());
create policy nl_ins on notification_log for insert with check (is_staff());
create policy st_sel on settings for select using (auth.uid() is not null);
create policy st_all on settings for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Storage: bucket privado "pod" (fotos e assinaturas). Caminho: {delivery_id}/{arquivo}
insert into storage.buckets (id, name, public) values ('pod','pod', false) on conflict do nothing;
create policy pod_up on storage.objects for insert with check (
  bucket_id = 'pod' and (auth_role() = 'admin' or (storage.foldername(name))[1]::uuid in (
    select d.id from deliveries d join routes r on r.id = d.route_id where r.driver_id = my_driver_id())));
create policy pod_read on storage.objects for select using (
  bucket_id = 'pod' and (is_staff() or owner = auth.uid()));
create policy pod_rm on storage.objects for delete using (bucket_id = 'pod' and auth_role() = 'admin');
```

### 4.3 `supabase/migrations/0003_functions.sql` (resumo do que conter)

```sql
-- 1) Novo usuário → profile 'motorista' (perfil real definido pelo admin via admin-users)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 2) Distância em metros (haversine) e distância ponto → polilinha (routes.geometry)
create or replace function dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2*6371000*asin(sqrt(power(sin(radians(lat2-lat1)/2),2)
       + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))) $$;
-- dist_to_route_m(route_id, lat, lng): loop nos segmentos de geometry, projeção
-- equirretangular ponto-segmento, retorna o mínimo em metros.

-- 3) Trigger AFTER INSERT em vehicle_positions:
--    atualiza vehicles.last_lat/lng/last_seen_at; se andou > 100 m desde a última, last_moved_at = now();
--    se route_id e dist_to_route_m > settings.alertas.fora_rota_m e não há alerta aberto → insere 'fora_da_rota'.

-- 4) Trigger AFTER INSERT em pods:
--    deliveries.status = new.result, delivered_at = new.recorded_at;
--    se todas as entregas da rota estão entregue/falha → routes.status='concluida', finished_at=now(),
--    vehicles.status='disponivel'.

-- 5) RPC release_route(p_route uuid)  [admin, despachante]:
--    routes.status='liberada', released_at=now(); deliveries.status='planejada'; vehicles.status='em_rota'.
-- 6) RPC start_route(p_route uuid)    [motorista dono da rota]:
--    routes.status='em_andamento', started_at=now(); deliveries da rota → 'a_caminho'.

-- 7) RPC check_alerts() returns int  [security definer; chamada pelo front a cada 60 s e por pg_cron]
--    Lê limites de settings.alertas e insere (sem duplicar alerta 'aberto' do mesmo tipo+entidade):
--    - entrega_atrasada: status in (pendente,planejada,a_caminho) and window_end < now()      (alta)
--    - veiculo_parado:   status='em_rota' and last_moved_at < now() - parado_min               (media)
--    - manutencao_vencendo: next_maintenance <= current_date + manutencao_dias                   (media)
--    - cnh_vencendo:     cnh_expiry <= current_date + cnh_dias and anonymized_at is null         (media)
--    Também grava notification_log(channel='painel') para cada alerta criado. Retorna nº criado.
--    Exemplo do primeiro bloco:
--    insert into alerts (type, severity, title, message, delivery_id)
--    select 'entrega_atrasada','alta','Entrega '||d.code||' atrasada',
--           'Janela encerrou às '||to_char(d.window_end at time zone 'America/Sao_Paulo','HH24:MI'), d.id
--      from deliveries d
--     where d.status in ('pendente','planejada','a_caminho') and d.window_end < now()
--       and not exists (select 1 from alerts a where a.delivery_id = d.id
--                        and a.type = 'entrega_atrasada' and a.status = 'aberto');

-- 8) RPC dashboard_kpis(p_from date, p_to date, p_region text default null) returns jsonb
--    {otd, custo_por_entrega, km_rodados, ocupacao, por_status:[...], por_regiao:[...], por_dia:[...]}
--    (fórmulas da seção 0)

-- 9) RPC demand_history(p_days int default 60) returns table(region text, day date, total int)

-- 10) LGPD [admin]: anonymize_driver(p uuid), anonymize_delivery(p uuid), lgpd_retention(p_days int default 90)
--    Nome → 'Anonimizado', telefone → null, endereço → só região, lat/lng arredondados a 2 casas,
--    pods.photo_path/signature_path → null (front apaga os arquivos do Storage antes), anonymized_at=now().
--    Mantém agregados (contagens, km, custos) para estatística.

-- 11) Realtime
alter publication supabase_realtime add table vehicle_positions, deliveries, alerts, routes;

-- 12) Configurações padrão
insert into settings (key, value) values
 ('alertas', '{"parado_min":20,"fora_rota_m":1000,"manutencao_dias":7,"cnh_dias":30,"risco_critico":60}'),
 ('deposito', '{"nome":"CD SENN AI-X","lat":-23.5505,"lng":-46.6333}'),
 ('roteirizacao', '{"vel_media_kmh":25,"tempo_parada_min":5,"fator_rua":1.3,"inicio":"08:00"}')
on conflict do nothing;

-- 13) (opcional) pg_cron: select cron.schedule('alertas','*/5 * * * *','select check_alerts()');
```

---

## 5. Fases de execução

Cada fase termina com um commit (seção 10). Critério de pronto em **negrito**.

### Fase 1 — Setup do projeto
- [x] Criar projeto Vite na raiz: `npm create vite@latest . -- --template react` (manter `.env*`, `.gitignore`, `PLANO.md`).
  - *Correção:* o `create vite` não roda de forma segura em pasta não vazia; o scaffold foi gerado em pasta temporária e copiado para a raiz sem sobrescrever arquivos existentes (README do template e assets de demonstração descartados; entradas úteis do `.gitignore` do Vite mescladas no existente). O template atual usa `oxlint` (`npm run lint`) no lugar do ESLint.
- [x] Dependências:
  ```
  npm i @supabase/supabase-js react-router-dom leaflet react-leaflet recharts papaparse jspdf jspdf-autotable
  npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
  npm i -D supabase
  ```
  (SheetJS pelo CDN oficial: a versão do registro npm está desatualizada e tem vulnerabilidade conhecida. Assinatura com `<canvas>` próprio — sem dependência extra.)
- [ ] `git init`, primeiro commit; criar repositório no GitHub e convidar **Cardoso30S, fiorezewesley, Greggori**. *(feito: `git init -b main`; pendente: commit, repositório e convites — com o usuário)*
- [x] Criar projeto em supabase.com; preencher `.env`; `npx supabase init`; `npx supabase login`; `npx supabase link --project-ref ttbilaufbrzqaeipnjad`.
- [x] `src/lib/env.js` (padrões quando a variável está vazia), `src/lib/supabase.js`, `index.css` com tokens de cor (contraste AA), `:focus-visible`, layout responsivo.
- **Pronto: `npm run dev` abre a página e `supabase.auth.getSession()` responde sem erro.**

### Fase 2 — Banco, RLS e seed
- [x] Escrever `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql` (seção 4) e `supabase/seed.sql` (seção 8).
  - *Nomes:* padrão da CLI em `supabase/migrations/` (`20261021120000_schema.sql`, `20261021120100_rls.sql`, `20261021120200_functions.sql`). **As migrations são a fonte da verdade**; o SQL das seções 4.1–4.3 ficou como rascunho histórico.
  - *Validação:* Docker indisponível na máquina → `supabase start`/`db reset` **não executados**; SQL revisado manualmente. Rodar `npx supabase db reset` assim que houver Docker.
  - *Correções feitas no SQL do plano (revisão antes de gravar):*
    1. Tudo qualificado com `public.`; funções `security definer` com `set search_path = ''` (evita sequestro de search_path); `pgcrypto` criado em `extensions`.
    2. Índices com nome explícito + índices que faltavam em FKs (`routes.vehicle_id`, `vehicle_positions.route_id`, `pods.driver_id`, `notification_log.alert_id`) e em `deliveries.window_start` (KPIs/previsão).
    3. Checks extras: `pods` exige `failure_reason` quando `falha`; `risk_score` 0–100; `risk_level` em baixo/medio/critico; lat/lng válidos em posições. `created_by` com `default auth.uid()`.
    4. RLS: policies `to authenticated` com helpers envolvidos em `(select …)` (avaliados uma vez por consulta); `with check` explícito em todo update; novos helpers `is_my_route()`/`is_my_delivery()` (security definer) no lugar de subconsultas sob RLS.
    5. Faltavam policies: `pods` update/delete (admin), `alerts` delete (equipe — matriz diz E), `vehicle_positions` delete (admin), `notification_log` delete (admin), `settings` separado em insert/update/delete (admin). Motorista só grava posição com `route_id` nulo ou de rota dele.
    6. Storage: o cast `foldername(name)[1]::uuid` quebrava a policy com erro em pastas inválidas → comparação como texto; `name` sem qualificar dentro da subconsulta resolvia para `routes.name` → `objects.name`; leitura pelo motorista usava `owner` (coluna obsoleta) → agora pela pasta da entrega dele; bucket com limite de 5 MB e só `image/jpeg|png|webp`.
    7. Trigger de posição: "andou > 100 m desde a última" nunca detectaria movimento lento (posições a cada 10 s) → compara com a posição do último movimento; `last_seen_at` usa `recorded_at`; fora da rota só para rota `em_andamento`.
    8. Trigger de POD: `delivered_at` só quando `entregue`; rota só é concluída se estava `liberada/em_andamento` (não sobrescreve histórico); `recorded_at` forçado para `now()` do servidor quando vem de usuário (RF07: data/hora do servidor).
    9. RPCs: `release_route` exige status `rascunho` com veículo e motorista; `start_route` aceita dono da rota ou admin e zera o "parado" (`last_moved_at = now()`); `check_alerts` recusa quem não é da equipe (pg_cron/service_role sem JWT passam), não alerta manutenção de veículo já `em_manutencao`, severidade alta quando já venceu, e também cria `risco_alto` a partir de `deliveries.risk_score`; datas em America/Sao_Paulo. `dashboard_kpis`/`demand_history` são `security invoker` (RLS de quem chama). LGPD com checagem explícita de admin.
    10. `EXECUTE` das RPCs revogado de `anon`/`public` (o Supabase concede ao anon por padrão) e concedido a `authenticated`/`service_role`.
  - *Seed:* determinístico via `hashtext()` (sem `random()`), chaves fixas e `on conflict do nothing`; o motorista de teste é o driver `…0203` (van SEN2B03). `profiles` só é preenchido pelo `seed-users.mjs`.
- [x] `npx supabase db push --include-seed` no projeto remoto (`ttbilaufbrzqaeipnjad`): as 3 migrations e o seed aplicaram na 1ª tentativa, **sem correções de SQL**.
- [x] `scripts/seed-users.mjs`: cria 4 usuários (admin, gestor, despachante, motorista) com `auth.admin.createUser`, atualiza `profiles.role` e vincula o motorista a `drivers`. Rodar: `node scripts/seed-users.mjs` (o script carrega `.env` e `supabase/functions/.env` sozinho). E-mails `@senn-aix.test` fixos no script; **senhas aleatórias geradas na 1ª execução** e gravadas em `scripts/test-users.local.json` (no `.gitignore`), reaproveitadas nas seguintes.
  - *Correção:* senhas não ficam no código nem no README (repositório é compartilhado); o README deve só apontar o arquivo local.
- **Pronto: no SQL Editor, `select count(*)` retorna dados em todas as tabelas; com o JWT do motorista, `select * from deliveries` só retorna entregas da rota dele.**

### Fase 3 — Autenticação e layout (RF01, RNF01, RNF03)
- [x] `AuthProvider` (sessão + profile), `RequireRole roles={[...]}`, `Login` com select de perfil, redirecionamento por perfil, `Layout` com menu filtrado por perfil (navegável por teclado, menu colapsa no mobile).
  - Arquivos: `src/auth/{AuthProvider.jsx, RequireRole.jsx, context.js, roles.js}`, `src/components/Layout.jsx`, `src/pages/{Login,Painel,Usuarios}.jsx`, rotas em `App.jsx`. `useAuth` fica em `context.js` (oxlint `only-export-components`).
  - Rotas desta fase: `/login`, `/` (redireciona por perfil), `/dashboard`, `/frota`, `/despacho`, `/motorista` (painéis provisórios — conteúdo nas fases 4, 5 e 9) e `/usuarios`. Qualquer outra URL → `/`. O menu só lista telas que já existem; as demais entram junto com suas fases.
  - Erro de perfil: "O perfil selecionado não corresponde a este usuário…" (após `signOut()`); usuário desativado e falha de rede têm mensagens próprias. Com `.env` vazio a tela de login mostra aviso e desabilita o botão.
- [x] Edge Function `admin-users` (valida JWT → `profiles.role='admin'` → `auth.admin.createUser`/`deleteUser`/update role). Página `Usuarios`.
  - *Desvio:* em vez de excluir, **desativa/reativa** (`ban_duration`), preservando histórico (entregas, PODs, alertas). Exclusão definitiva fica para a tela LGPD da Fase 10. Ações: `list`, `create`, `update` (perfil, nome, senha), `deactivate`, `activate`. O admin não pode desativar nem rebaixar a si mesmo. `create` apaga o usuário do Auth se a gravação do perfil falhar.
  - Cadastro público desligado: `enable_signup = false` em `[auth]` do `supabase/config.toml` (**no projeto remoto, desligar também em Authentication → Sign In / Providers → "Allow new users to sign up"**; o `config.toml` só vale para o ambiente local/`config push`).
  - CORS em `supabase/functions/_shared/cors.ts`; `ALLOWED_ORIGIN` (novo, em `supabase/functions/.env.example`) restringe a origem.
  - Limite conhecido: usuário desativado mantém o access token atual até expirar (padrão 1 h); não consegue renovar nem entrar de novo.
  - Validação: `npm run build`, `npm run lint` e `npx deno check` da função ok; `npm run dev` responde `/` e `/login`.
  - Deploy: `npx supabase functions deploy admin-users` (feito; `ALLOWED_ORIGIN` vazio = `*`).
  - Teste ponta a ponta no remoto (supabase-js): anon não lê veículos; os 4 usuários entram e leem o próprio `role`; admin vê 6 veículos; motorista vê só o próprio veículo/rotas e nenhum alerta; despachante lê entregas; `admin-users` `list` ok para admin e 403 para despachante; `dashboard_kpis` responde.
- **Pronto: cada um dos 4 usuários cai no seu painel; perfil errado no select é recusado; URL de tela proibida redireciona para `/`.**

### Fase 4 — Cadastros (RF02, RF03, RF04)
- [x] `Veiculos`, `Motoristas`, `Pedidos` com `DataTable` (busca, ordenação) + formulário com labels visíveis e validação (placa, datas, números > 0, janela fim > início).
  - Arquivos: `src/pages/{Veiculos,Motoristas,Pedidos}.jsx`, `src/components/{DataTable,Field,ConfirmDialog,ImportarPedidos}.jsx`, `src/lib/{csv,geocode,labels,useForm,dbError}.js`. Rotas `/veiculos`, `/motoristas`, `/pedidos` para admin, gestor e despachante; a escrita é decidida na página pela matriz da seção 3 (veículos/motoristas: admin+gestor; pedidos: admin+despachante) e garantida pelo RLS. Links nos painéis `/frota` e `/despacho`.
  - Validação no blur (erro some ao corrigir, `aria-invalid` + `aria-live`), exclusão com `<dialog>` nomeado, estados vazios com ação. Placa normalizada (maiúsculas, sem hífen) e validada com o mesmo regex do banco. CNH vencida é recusada no formulário. Destaque visual na listagem: manutenção ≤ 7 dias e CNH ≤ 30 dias (valores fixos; alertas reais e `settings.alertas` na Fase 8).
  - *Desvio:* pedidos só são editados/excluídos com status `pendente` (depois disso o ciclo segue pela roteirização/POD). Lista de pedidos filtrada por status (padrão `pendente`), limite de 500 linhas — paginação com `range()` na Fase 10.
  - Sem migration nova: schema e RLS da Fase 2 já cobriam tudo. Nenhum vínculo motorista ↔ usuário (`profile_id`) na tela; continua pelo `seed-users.mjs`.
- [x] Motorista: select de veículo disponível (unique no banco garante 1:1), checkbox consentimento LGPD + finalidade.
  - O select lista veículos sem motorista (mais o atual); violação de unicidade vira mensagem amigável. `consent_at` mantém a data original ao editar.
- [x] Pedido: campo endereço → botão "Localizar" (Nominatim); se falhar, lat/lng manuais.
  - `src/lib/geocode.js`: fila global de 1 req/s, timeout 10 s, `countrycodes=br`; no navegador não dá para definir User-Agent (o Referer identifica). Com `VITE_ENABLE_MAPS=false` o botão fica desligado e só vale lat/lng digitados. Pedido sem coordenada pode ser salvo e aparece com selo "Sem coordenada".
- [x] Importação CSV (seção 7): pré-visualização com erros por linha, importa só as válidas, geocodifica as sem lat/lng em fila de 1 req/s.
  - Prévia mostra linha, código, situação e motivo (inclui código repetido no arquivo e já cadastrado); colunas obrigatórias ausentes bloqueiam a prévia. Grava as válidas num único `insert` e **depois** geocodifica as sem lat/lng (1 req/s, para no primeiro erro do serviço; as que sobrarem ficam "Sem coordenada").
  - `public/exemplo-pedidos.csv` (8 pedidos, 2 sem lat/lng, decimais com `.` e `,`) com link "Baixar arquivo de exemplo" na tela. Teste: `npm test` (`src/lib/csv.test.js`; o `node --test src/lib` com pasta não funciona no Windows/Node 24, por isso o script usa glob).
  - Validação: build, lint e `npm test` ok; teste de API no remoto (gestor CRUD de veículo/motorista, placa inválida 23514, veículo duplicado 23505, despachante cria pedido e lote do CSV, despachante não cria veículo e motorista não cria pedido → 42501); teste no navegador como gestor e despachante (validação, exclusão nomeada, prévia do CSV válido/inválido, importação 8/8 com geocodificação, fallback com Nominatim fora do ar). Dados de teste removidos.
- **Pronto: CRUD completo dos três; `public/exemplo-pedidos.csv` importa 100% e um CSV com erro mostra a linha e o motivo.**

### Fase 5 — Roteirização (RF05)
- [x] `src/lib/routing.js` (algoritmo abaixo) + `routing.test.js` (`npm test`).
  - *Desvio no algoritmo:* em vez de alocar first-fit e depois sequenciar, cada veículo (menor `cost_per_km` primeiro) monta a rota por **vizinho mais próximo em tempo** (deslocamento + espera da janela, ponderado pela prioridade: urgente 0,25 · alta 0,5 · normal 1 · baixa 1,25) entre os pedidos que cabem em kg, m³, janela e autonomia (incluindo a volta ao depósito). Assim capacidade/janela/autonomia são garantidas na construção; 2-opt depois só aceita trocas viáveis que reduzem a distância. Parâmetros de `settings.roteirizacao` (velocidade, tempo de parada, fator de rua, início). Motivos de não alocação: sem coordenada, sem veículo, capacidade, autonomia, janela, frota (veículos cheios/sem horário).
  - Limites: 2-opt ignora prioridade (só distância, com janelas válidas); heurística gulosa, não ótima; 2-opt é O(n³) por rota (ok para dezenas de paradas por veículo).
  - Testes: capacidade kg/m³, janelas (inclui espera), autonomia, 2-opt não piora, entrada vazia, sem veículo, sem coordenada, frota cheia, urgente priorizado, cada pedido uma única vez.
- [x] Tela `Roteirizacao` (`/roteirizacao`, admin e despachante; link no `/despacho` e no menu): data, checkboxes de pedidos pendentes sem rota (janela iniciando na data) e de veículos `disponivel` com motorista disponível e CNH válida → "Gerar rotas" → mapa (Leaflet, carregado sob demanda) com polilinha/cor por rota + lista ordenada de paradas com ETA, janela, km, tempo, custo, carga/capacidade e link "Abrir no OpenStreetMap"; tabela de não alocados com motivo. Fallback: `VITE_ENABLE_MAPS=false` ou ≥ 3 `tileerror` → aviso e só a lista (que sempre aparece).
- [ ] "Explicar com IA" (opcional): fica para a Fase 7 (`routes.ai_notes` já existe; o botão entra na tela `Roteirizacao`).
- [x] "Salvar e liberar": insere `routes` (rascunho), atualiza `deliveries.route_id/stop_order/eta` só se ainda `pendente` e sem rota (senão desfaz a rota) e chama `release_route`. Rascunho que não liberou aparece em "Rotas salvas" com botão "Liberar".
- [x] `MotoristaHome` (`/motorista`): rota do dia (RLS: só as do motorista; admin escolhe entre todas), mapa, lista de paradas, botão "Iniciar rota" (`start_route`).
  - Sem migration nova. Validação: build, lint e `npm test` ok; teste de API no remoto: 30 pedidos do seed → 5 rotas, 27 alocadas, 3 não alocadas por janela vencida, nenhuma capacidade/autonomia excedida; `release_route` ok (repetir → P0002; gestor → 42501); motorista vê só a rota dele e as paradas dela, não vê/inicia a de outro, `start_route` ok. Dados restaurados. Navegador: só a geração no `/roteirizacao` foi conferida (mapa + lista); salvar/liberar pela tela, tela do motorista e 375 px não foram testados no navegador (prioridade de prazo).
- **Pronto: 30 pedidos do seed geram rotas sem exceder capacidade; teste unitário passa; motorista vê a rota liberada.**

**Algoritmo (documentar no README):**
1. Distância = haversine × `fator_rua` (1,3); tempo = distância ÷ `vel_media_kmh` + `tempo_parada_min` por parada.
2. Ordena pedidos por prioridade (urgente→baixa) e depois `window_end`.
3. Alocação (first-fit): cada pedido vai para o primeiro veículo cuja soma de kg **e** m³ cabe e cuja distância estimada (ida+volta ao depósito) cabe na autonomia.
4. Sequência por veículo: vizinho mais próximo a partir do depósito, escolhendo só paradas cuja chegada ≤ `window_end` (espera se chegar antes de `window_start`); empate → menor `window_end`.
5. Melhoria 2-opt: inverte trechos enquanto reduz a distância **e** todas as janelas continuam viáveis.
6. Pedido sem veículo/janela viável → lista "não alocados" com motivo (capacidade, janela, autonomia).
7. Saída por rota: paradas ordenadas, ETAs, `total_km`, `total_min`, `est_cost = total_km × cost_per_km`, `load_kg`, `geometry`.
- Complexidade O(n²) por rota; adequado a centenas de pedidos. Não depende de IA nem de internet (cobre RNF06).

### Fase 6 — Rastreamento e POD (RF06, RF07, RNF04)
- [ ] `src/lib/live.js` → `useLive(table, filter, fetcher)`: assina `postgres_changes`; se o status do canal for `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` → `setInterval(fetcher, VITE_POLLING_MS)`; mostra indicador "Tempo real" / "Atualização a cada 15 s".
- [ ] `MotoristaHome`: `navigator.geolocation.watchPosition` com envio a cada 10 s para `vehicle_positions`; **modo simulação** (botão) que percorre a `geometry` da rota a cada 3 s — usado na demonstração.
- [ ] `Rastreamento`: marcadores de veículos (última posição), paradas coloridas por status (a caminho = azul, entregue = verde, falha = vermelho, pendente = cinza), filtros por rota, motorista, região; legenda com texto (não só cor).
- [ ] `EntregaPod`: resultado (entregue/falha + motivo), método (foto via `<input type="file" accept="image/*" capture="environment">`, código digitado, ou assinatura em `SignaturePad`), geolocalização automática, data/hora do servidor; upload em `pod/{delivery_id}/…`; insert em `pods` (trigger atualiza status).
- **Pronto: com o modo simulação ligado em uma aba, o veículo se move no mapa de outra aba em < 3 s; POD muda o ponto para verde sem recarregar.**

### Fase 7 — Edge Function de IA (base de RF08, RF09, RF12, RF13)
- [ ] `_shared/llm.ts`: `chat(messages, {json})` → `POST {AI_BASE_URL}chat/completions` com `Authorization: Bearer AI_API_KEY`, `model: AI_MODEL`, `temperature: 0.2`, `response_format: {type:'json_object'}` quando `json`; timeout 20 s; base padrão por `AI_PROVIDER`; `AI_PROVIDER=none` ou sem chave → lança `AI_DISABLED`.
- [ ] `_shared/auth.ts`: cria client com o JWT do usuário (RLS vale para o contexto que a IA recebe) e lê o perfil; recusa anônimo.
- [ ] `ai/index.ts`: `{action, payload}` → prompt de sistema por ação (tabela abaixo) → valida o JSON → `{ok:true, source:'ia', data}` ou `{ok:false, error}`.
- [ ] `src/lib/ai.js`: `askAI(action, payload, fallbackFn)` → se `VITE_ENABLE_AI` falso ou erro/timeout → `{source:'local', data: fallbackFn()}`. A UI mostra selo "Gerado por IA" ou "Cálculo local".
- [ ] Deploy: `npx supabase functions deploy ai` e `npx supabase secrets set --env-file supabase/functions/.env`.
- **Pronto: com chave válida a resposta vem `source:'ia'`; com `AI_PROVIDER=none` a tela continua funcionando com `source:'local'`.**

| Ação | Entrada enviada | Saída JSON esperada |
|---|---|---|
| `forecast` | histórico diário por região (60 dias) + previsão local | `{regioes:[{regiao, d7:[7 números], d30_total, tendencia, comentario}]}` |
| `risk` | entregas críticas com pontuação e motivos | `{itens:[{id, explicacao, acoes:["replanejar"\|"priorizar"\|"contatar_cliente"\|"trocar_veiculo"]}]}` |
| `insights` | KPIs do período, custo/falhas por região, ocupação, atrasos por hora | `{resumo, gargalos:[], regioes_custo:[], recomendacoes:[]}` |
| `chat` | pergunta + contexto (KPIs do dia, contagem por status, alertas abertos, entrega citada) + catálogo de telas | `{resposta, acoes:[{rotulo, rota}]}` |
| `route_explain` | rotas geradas (km, carga, janelas, não alocados) | `{texto}` |

Prompt de sistema base (em português, documentado no README): "Você é o assistente analítico da SENN AI-X, operadora de logística de última milha. Responda somente com base nos dados fornecidos, em português do Brasil, de forma objetiva. Não invente números. Responda apenas no formato JSON especificado: …".

### Fase 8 — Previsão, risco e alertas (RF08, RF09, RF11)
- [ ] `forecast.js`: para cada região, média móvel dos últimos 28 dias × fator do dia da semana (média do dia da semana ÷ média geral); 7 valores diários + total de 30 dias. Teste com série sintética.
- [ ] `Previsao`: seletor 7/30 dias, gráfico de linha (histórico + previsão tracejada) e barras por região; botão "Refinar com IA". Resumo no Dashboard.
- [ ] `risk.js` — pontuação 0–100 (limite 100):
  - ETA > `window_end`: +50; folga < 30 min: +25; folga < 60 min: +10
  - sem rota e `window_start` < agora + 2 h: +20
  - prioridade urgente: +10
  - veículo da rota parado (alerta aberto) ou em manutenção: +15
  - taxa de falha histórica da região × 30
  - nível: < 30 baixo, 30–59 médio, ≥ 60 crítico
  - ação por regra: ETA estourado → "replanejar"; urgente sem rota → "priorizar"; região com falha alta → "contatar cliente".
- [ ] `Riscos`: tabela ordenada por pontuação, badge de nível (texto + cor), motivos, ações (botões "Priorizar" → prioridade urgente; "Replanejar" → leva à roteirização com o pedido marcado). Recalcula ao abrir e a cada atualização em tempo real; grava `risk_*` em `deliveries`; críticos geram alerta `risco_alto`.
- [ ] Alertas: front chama `rpc('check_alerts')` a cada 60 s (enquanto houver usuário da equipe logado) e depois `functions.invoke('send-alerts')`.
- [ ] `send-alerts`: pega alertas com `emailed_at is null` e severidade alta/média, envia via Resend para `ALERT_EMAIL_TO`, grava `emailed_at` e `notification_log(channel='email')`. Sem `RESEND_API_KEY` → responde `{skipped:true}` sem erro.
- [ ] `Alertas`: lista em tempo real (abertos/resolvidos), filtros por tipo, botão "Marcar como resolvido", aba "Log de notificações"; contador no menu.
- **Pronto: entrega com janela no passado gera alerta em ≤ 60 s; resolver some da lista de abertos; log mostra painel (+ e-mail se configurado).**

### Fase 9 — Dashboard, Análise Inteligente e Chatbot (RF10, RF12, RF13)
- [ ] `Dashboard`: filtros de período (hoje, 7, 30 dias, personalizado) e região → `rpc('dashboard_kpis')`; cards OTD, custo/entrega, km, ocupação; gráficos (Recharts) de entregas por status e por região, série diária.
- [ ] `export.js`: PDF (jsPDF + autotable: título, período, KPIs, tabelas) e Excel (SheetJS: abas KPIs, PorStatus, PorRegiao, Entregas).
- [ ] `Analise`: `insights.js` gera por regras (região com maior custo/entrega, maior taxa de falha, horário com mais atrasos, veículos com ocupação < 50%); "Gerar análise com IA" envia os mesmos agregados; mostra texto + 2 gráficos (custo por região, atrasos por hora).
- [ ] `ChatHelper`: botão flutuante acessível (Esc fecha, foco preso no diálogo); envia pergunta; renderiza resposta e botões de ação (`navigate(rota)`); fallback `chatFallback.js`: reconhece código de entrega (`/[A-Z]{2,}-?\d+/`) → consulta status; "atrasad", "OTD", "custo", "alerta" → consultas diretas; "como"/"onde" → descreve a tela e oferece link.
- **Pronto: exportações abrem no leitor de PDF/Excel com os números da tela; chat responde "qual o status da entrega PED-0001?" com e sem IA.**

### Fase 10 — LGPD, backup e qualidade (RNF02, RNF03, RNF05, RNF08)
- [ ] `AdminDados`: editar `settings`; "Exportar backup (JSON)" (lê todas as tabelas e baixa um arquivo); LGPD: buscar motorista/destinatário → "Anonimizar" (apaga arquivos do Storage + RPC) e "Excluir"; "Aplicar retenção (90 dias)".
- [ ] `scripts/backup.mjs`: exporta cada tabela para `backups/AAAA-MM-DD/<tabela>.json`. Também: `npx supabase db dump -f backups/schema.sql` e `npx supabase db dump --data-only -f backups/data.sql`.
- [ ] Restauração documentada: `supabase db reset` (local) ou rodar migrations em projeto novo + `psql "<connection string>" -f backups/data.sql`.
- [ ] Passada de acessibilidade: navegar tudo só com Tab/Enter/Esc; `aria-label` em botões só-ícone; tabelas com `<th scope>`; mapa sempre acompanhado da lista equivalente; testar em 375 px.
- [ ] Performance: paginação (`range`) nas listas, `select` só das colunas usadas, lazy routes (`React.lazy`) para páginas com mapa/gráficos, `npm run build` sem avisos de chunk gigante não tratados.
- **Pronto: backup JSON baixa e reimporta; anonimizar remove nome/telefone/arquivos mantendo os KPIs; Lighthouse acessibilidade ≥ 90 no Dashboard.**

### Fase 11 — Documentação e entrega (RNF09)
- [ ] `README.md`: visão geral, requisitos (Node 20+, conta Supabase), instalação passo a passo, variáveis de ambiente (as duas `.env.example`), comandos, usuários de teste, deploy das funções, **modelo de IA e integração** (provedor, modelo, endpoint `/functions/v1/ai`, ações, prompts, formato JSON, fallback), **abordagem de roteirização** (algoritmo da Fase 5), fórmulas dos KPIs, decisões da seção 0, estrutura de pastas, backup/restauração, LGPD.
- [ ] `docs/MANUAL_USUARIO.md`: um capítulo por perfil, com passo a passo das tarefas e capturas de tela.
- [ ] Checklist da seção 11.

---

## 6. RF → como implementar e como testar

| RF | Implementação (resumo) | Teste |
|---|---|---|
| RF01 | Supabase Auth + `profiles.role`; login com select de perfil; `RequireRole`; admin cria usuários (`admin-users`). | Logar com os 4 usuários; perfil errado é recusado; acessar `/usuarios` como motorista redireciona; via API o motorista não altera o próprio `role` (RLS). |
| RF02 | Tabela `vehicles`, tela `Veiculos`. | Criar/editar/excluir; placa inválida é recusada; status muda para `em_rota` ao liberar rota. |
| RF03 | Tabela `drivers`, vínculo único com veículo, tela `Motoristas`. | Vincular o mesmo veículo a 2 motoristas → erro amigável; CNH a vencer gera alerta. |
| RF04 | Tela `Pedidos`, CSV via PapaParse, Nominatim. | Importar `exemplo-pedidos.csv`; CSV com peso negativo mostra erro na linha. |
| RF05 | `routing.js` + tela `Roteirizacao` + `release_route`. | `node --test src/lib`; conferir no mapa que nenhuma rota excede capacidade e ETAs ≤ fim da janela. |
| RF06 | Realtime em `vehicle_positions`/`deliveries` + polling; filtros. | Modo simulação em uma aba, painel em outra; derrubar rede do Realtime (DevTools → bloquear `wss`) → indicador muda para polling e continua atualizando. |
| RF07 | `EntregaPod`, Storage `pod`, trigger em `pods`. | Registrar POD com cada método; status e mapa mudam; foto abre via URL assinada. |
| RF08 | `forecast.js` + ação `forecast`. | Teste unitário; tela mostra 7 e 30 dias por região com e sem IA. |
| RF09 | `risk.js` + ação `risk` + alerta `risco_alto`. | Criar pedido com janela terminando em 20 min e sem rota → crítico, sugere "priorizar", alerta aparece. |
| RF10 | `dashboard_kpis` + Recharts + `export.js`. | Conferir OTD manualmente com SQL; exportar PDF e Excel. |
| RF11 | `check_alerts`, triggers de posição, `send-alerts`, tela `Alertas`. | Cada um dos 6 tipos provocado com dados do seed; resolver; log registra. |
| RF12 | `insights.js` + ação `insights`. | Análise mostra texto + gráficos; com IA desligada, versão por regras. |
| RF13 | `ChatHelper` + ação `chat` + `chatFallback.js`. | Perguntas: status de entrega, OTD da semana, "como importar CSV?" → resposta + botão que navega. |

## 7. Formato do CSV de importação (`public/exemplo-pedidos.csv`)

- UTF-8, cabeçalho obrigatório, separador `;` ou `,` (detectado automaticamente), decimais com `.` ou `,`.
- Datas: `AAAA-MM-DD HH:mm` (horário de Brasília).

| Coluna | Obrigatória | Regra |
|---|---|---|
| `codigo` | sim | único; ex. `PED-1001` |
| `destinatario` | sim | texto |
| `telefone` | não | dígitos |
| `endereco` | sim | rua, número, bairro, cidade |
| `regiao` | sim | ex. `Zona Sul` |
| `lat`, `lng` | não | se vazios, geocodifica pelo endereço |
| `janela_inicio`, `janela_fim` | sim | fim > início |
| `peso_kg`, `volume_m3` | sim | > 0 |
| `prioridade` | não | `baixa`/`normal`/`alta`/`urgente` (padrão `normal`) |
| `consentimento` | sim | `sim`/`nao` |
| `finalidade` | não | padrão "Execução da entrega contratada" |

```
codigo;destinatario;telefone;endereco;regiao;lat;lng;janela_inicio;janela_fim;peso_kg;volume_m3;prioridade;consentimento;finalidade
PED-1001;Ana Souza;11988887777;Av. Paulista, 1000, Bela Vista, São Paulo;Centro;-23.5640;-46.6527;2026-10-22 09:00;2026-10-22 12:00;4.5;0.02;normal;sim;
PED-1002;Bruno Lima;;Rua Voluntários da Pátria, 500, Santana, São Paulo;Zona Norte;;;2026-10-22 13:00;2026-10-22 17:00;12;0.08;urgente;sim;
```

## 8. Seed de dados (`supabase/seed.sql`)

- 6 veículos (2 motos, 2 vans, 1 utilitário, 1 caminhão leve), um com `next_maintenance` em 3 dias, um `em_manutencao`.
- 6 motoristas, um com CNH vencendo em 15 dias; 5 vinculados a veículos.
- 5 regiões de São Paulo com centro (Centro −23.550/−46.633; Norte −23.480/−46.620; Sul −23.650/−46.700; Leste −23.540/−46.470; Oeste −23.560/−46.720).
- **Histórico de 60 dias** via `generate_series`: 15–35 entregas/dia, volume diferente por região e dia da semana (seg/sex mais altos, domingo baixo) e leve tendência de alta → previsão tem sinal. ~92% `entregue` (85% dentro da janela), ~8% `falha` (mais na Zona Leste); `routes` concluídas correspondentes com km e custo → KPIs e Análise têm conteúdo.
- **Hoje**: 30 pedidos `pendente` para roteirizar, 2 com janela já vencida (alerta de atraso), 1 urgente com janela curta (risco crítico).
- Usuários: `scripts/seed-users.mjs` (Auth não é populado por SQL no projeto hospedado).

## 9. Requisitos não funcionais

| RNF | Como atender |
|---|---|
| RNF01 Segurança | Supabase Auth (senha com hash, JWT); RLS em **todas** as tabelas e no Storage; perfil só alterável por admin; Edge Functions validam JWT e perfil; SQLi: só supabase-js/RPC parametrizados, sem SQL concatenado; XSS: React escapa por padrão, proibido `dangerouslySetInnerHTML` (inclusive em respostas da IA); CSRF: autenticação por token Bearer no header (não cookie), CORS restrito nas funções; chaves de IA/Resend/service_role só no servidor. |
| RNF02 Performance | Índices da seção 4.1; KPIs agregados no banco (RPC); paginação; lazy loading de rotas; roteirização O(n²) no cliente sem chamadas de rede. |
| RNF03 Usabilidade/acessibilidade | Contraste AA, foco visível, tudo por teclado, labels visíveis, status com texto além da cor, layout responsivo (375 px+), mensagens de erro com ação de recuperação. |
| RNF04 Tempo real | Supabase Realtime (WebSocket) com meta < 3 s; fallback de polling (`VITE_POLLING_MS`); indicador de modo. |
| RNF05 Backup | Seção Fase 10: export JSON (botão + script), `supabase db dump`, procedimento de restauração testado, frequência diária. |
| RNF06 Fallback | Seção 9.1. |
| RNF07 Modular | `lib/` com funções puras testáveis (routing, forecast, risk, insights), `pages/` por domínio, Edge Function de IA isolada com provedor trocável por variável, migrations separadas. |
| RNF08 LGPD | Consentimento + finalidade em motoristas e destinatários; minimização (só campos necessários); anonimizar/excluir sob demanda; retenção de 90 dias para dados pessoais de destinatários; Storage privado com URL assinada; backups fora do Git; dados enviados à IA são agregados ou sem nome/telefone. |
| RNF09 Manual | `docs/MANUAL_USUARIO.md` por perfil. |

### 9.1 Modo fallback (RNF06)

| Componente | Falha detectada por | Comportamento |
|---|---|---|
| IA (qualquer ação) | `VITE_ENABLE_AI=false`, `AI_PROVIDER=none`, sem chave, timeout 20 s, HTTP ≠ 200 ou JSON inválido | Usa `forecast.js`, `risk.js`, `insights.js`, `chatFallback.js`; selo "Cálculo local". |
| Roteirização | — | Já é local (heurística); IA só explica. |
| Mapa | `VITE_ENABLE_MAPS=false` ou ≥ 3 eventos `tileerror` | `MapFallbackTable`: lista de veículos/paradas com lat/lng, status e link "abrir no OpenStreetMap". |
| Geocodificação | erro/timeout do Nominatim | Campos lat/lng manuais; importação CSV marca a linha "sem coordenada" (não roteirizável até corrigir). |
| Tempo real | status do canal ≠ `SUBSCRIBED` | Polling a cada `VITE_POLLING_MS`. |
| E-mail | sem `RESEND_API_KEY` ou erro | Alerta só no painel; `notification_log` registra a falha. |

## 10. Plano de commits (mínimo 3 — previstos 11)

1. `chore: setup Vite + React, dependências e configuração base` (Fase 1)
2. `feat(db): schema, RLS, funções e seed do Supabase` (Fase 2)
3. `feat(auth): login por perfil, rotas protegidas e gestão de usuários` (Fase 3)
4. `feat: cadastros de veículos, motoristas e pedidos com importação CSV` (Fase 4)
5. `feat(rotas): roteirização heurística com janelas e capacidade` (Fase 5)
6. `feat(tempo-real): rastreamento no mapa e comprovante de entrega` (Fase 6)
7. `feat(ia): edge function de IA com provedor configurável` (Fase 7)
8. `feat: previsão de demanda, risco de atraso e alertas` (Fase 8)
9. `feat: dashboard com exportação, análise inteligente e chatbot` (Fase 9)
10. `feat: LGPD, backup e melhorias de acessibilidade` (Fase 10)
11. `docs: README e manual do usuário` (Fase 11)

`git push` após cada commit.

## 11. Checklist de entrega final

- [ ] Repositório GitHub com acesso concedido a **Cardoso30S**, **fiorezewesley**, **Greggori** (convites aceitos ou repositório público).
- [ ] ≥ 3 commits com mensagens descritivas, todos enviados (`git log --oneline origin/main`).
- [ ] Nenhum segredo versionado: `git ls-files | grep -E "\.env$"` vazio; só `.env.example` no repo.
- [ ] `README.md` com instalação, execução, dependências, variáveis de ambiente, IA (modelo, integração, prompts, endpoints), roteirização, decisões.
- [ ] `docs/MANUAL_USUARIO.md`.
- [ ] Clonar em pasta limpa, seguir só o README e rodar com sucesso (`npm install`, `npm run dev`, `npm run build`, `node --test src/lib`).
- [ ] Teste final com os 4 perfis + teste de fallback (IA desligada, mapa desligado).
- [ ] Pasta zipada **`moduloA_nomeEquipe.zip`** (sem `node_modules`, `dist`, `.env`, `backups/`): `git archive -o moduloA_nomeEquipe.zip HEAD`.
- [ ] PDF final com: nome da equipe, link do repositório, resumo da solução, arquitetura, decisões sobre ambiguidades, como a IA e a roteirização funcionam, usuários de teste, capturas de tela.

## 12. Rastreabilidade

| Requisito | Fase / passo |
|---|---|
| RF01 | F3 (login, RequireRole, admin-users); 4.2 profiles; seção 3 |
| RF02 | F4 Veículos; 4.1 `vehicles` |
| RF03 | F4 Motoristas; 4.1 `drivers` |
| RF04 | F4 Pedidos + CSV; seção 7 |
| RF05 | F5 routing.js, Roteirizacao, release_route, MotoristaHome |
| RF06 | F6 live.js, Rastreamento, envio de posição/simulação |
| RF07 | F6 EntregaPod, Storage `pod`, trigger pods |
| RF08 | F7 ação `forecast`; F8 forecast.js, Previsao; F9 resumo no Dashboard |
| RF09 | F7 ação `risk`; F8 risk.js, Riscos, alerta `risco_alto` |
| RF10 | F9 Dashboard, dashboard_kpis, export.js |
| RF11 | F2 check_alerts/triggers; F8 send-alerts, Alertas, notification_log |
| RF12 | F7 ação `insights`; F9 Analise, insights.js |
| RF13 | F7 ação `chat`; F9 ChatHelper, chatFallback.js |
| RNF01 | F2 RLS; F3 auth; F7 validação de JWT; seção 9 |
| RNF02 | F2 índices/RPC; F10 paginação/lazy |
| RNF03 | F1 tokens/foco; F10 passada de acessibilidade |
| RNF04 | F6 Realtime + polling |
| RNF05 | F10 backup.mjs, botão JSON, restauração |
| RNF06 | F5 heurística local; F7 ai.js; seção 9.1 |
| RNF07 | Seção 1 (estrutura); F7 provedor configurável |
| RNF08 | F4 consentimento; F10 anonimizar/retenção; seção 9 |
| RNF09 | F11 MANUAL_USUARIO.md |
| Entrega | F1 convite aos avaliadores; seção 10; seção 11 |
