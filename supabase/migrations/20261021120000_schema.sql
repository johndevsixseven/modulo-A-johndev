-- 0001 · Schema: enums, tabelas, índices (PLANO.md seção 4.1)
create extension if not exists pgcrypto with schema extensions;

create type public.app_role        as enum ('admin','gestor_frota','despachante','motorista');
create type public.vehicle_type    as enum ('moto','carro','utilitario','van','caminhao_leve','caminhao_medio');
create type public.vehicle_status  as enum ('disponivel','em_rota','em_manutencao');
create type public.delivery_status as enum ('pendente','planejada','a_caminho','entregue','falha','cancelada');
create type public.priority_level  as enum ('baixa','normal','alta','urgente');
create type public.route_status    as enum ('rascunho','liberada','em_andamento','concluida','cancelada');
create type public.pod_method      as enum ('foto','codigo','assinatura');
create type public.alert_type      as enum ('entrega_atrasada','veiculo_parado','fora_da_rota','manutencao_vencendo','cnh_vencendo','risco_alto');
create type public.alert_severity  as enum ('baixa','media','alta');
create type public.alert_status    as enum ('aberto','resolvido');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.app_role not null default 'motorista',
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),  -- antiga e Mercosul
  type public.vehicle_type not null,
  capacity_kg numeric(10,2) not null check (capacity_kg > 0),
  capacity_m3 numeric(10,3) not null check (capacity_m3 > 0),
  range_km numeric(10,1) not null check (range_km > 0),
  cost_per_km numeric(10,2) not null default 1.50 check (cost_per_km >= 0),
  status public.vehicle_status not null default 'disponivel',
  next_maintenance date,
  last_lat double precision, last_lng double precision,
  last_seen_at timestamptz, last_moved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  cnh_category text not null check (cnh_category in ('A','B','C','D','E','AB','AC','AD','AE')),
  cnh_expiry date not null,
  phone text,
  available boolean not null default true,
  vehicle_id uuid unique references public.vehicles(id) on delete set null,
  consent_at timestamptz,               -- LGPD
  consent_purpose text,
  anonymized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  route_date date not null default current_date,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  status public.route_status not null default 'rascunho',
  total_km numeric(10,2) not null default 0,
  total_min integer not null default 0,
  est_cost numeric(10,2) not null default 0,
  load_kg numeric(10,2) not null default 0,
  geometry jsonb not null default '[]',   -- [[lat,lng], ...] depósito → paradas → depósito
  ai_notes text,
  released_at timestamptz, started_at timestamptz, finished_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  recipient_name text not null,
  recipient_phone text,
  address text not null,
  region text not null,
  lat double precision, lng double precision,
  window_start timestamptz not null,
  window_end timestamptz not null,
  weight_kg numeric(10,2) not null check (weight_kg > 0),
  volume_m3 numeric(10,3) not null check (volume_m3 > 0),
  priority public.priority_level not null default 'normal',
  status public.delivery_status not null default 'pendente',
  route_id uuid references public.routes(id) on delete set null,
  stop_order integer,
  eta timestamptz,
  delivered_at timestamptz,
  risk_score integer check (risk_score between 0 and 100),
  risk_level text check (risk_level in ('baixo','medio','critico')),
  risk_reasons jsonb, risk_actions jsonb,
  consent boolean not null default false,  -- LGPD: consentimento do destinatário
  purpose text not null default 'Execução da entrega contratada',
  anonymized_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (window_end > window_start)
);

create table public.vehicle_positions (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  speed_kmh numeric(6,1),
  recorded_at timestamptz not null default now()
);

create table public.pods (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  result public.delivery_status not null check (result in ('entregue','falha')),
  failure_reason text,
  method public.pod_method,
  photo_path text, signature_path text, code text,
  lat double precision, lng double precision,
  recorded_at timestamptz not null default now(),
  check (result = 'entregue' or failure_reason is not null)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  type public.alert_type not null,
  severity public.alert_severity not null default 'media',
  title text not null,
  message text not null,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  route_id uuid references public.routes(id) on delete cascade,
  status public.alert_status not null default 'aberto',
  emailed_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id bigint generated always as identity primary key,
  alert_id uuid references public.alerts(id) on delete set null,
  channel text not null check (channel in ('painel','email')),
  recipient text,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Índices (RNF02) — FKs não ganham índice automático no Postgres
create index deliveries_status_idx        on public.deliveries (status);
create index deliveries_region_created_idx on public.deliveries (region, created_at);
create index deliveries_window_start_idx  on public.deliveries (window_start);
create index deliveries_route_stop_idx    on public.deliveries (route_id, stop_order);
create index deliveries_open_window_idx   on public.deliveries (window_end) where status in ('pendente','planejada','a_caminho');
create index routes_date_status_idx       on public.routes (route_date, status);
create index routes_driver_idx            on public.routes (driver_id);
create index routes_vehicle_idx           on public.routes (vehicle_id);
create index positions_vehicle_time_idx   on public.vehicle_positions (vehicle_id, recorded_at desc);
create index positions_route_idx          on public.vehicle_positions (route_id);
create index pods_driver_idx              on public.pods (driver_id);
create index alerts_status_created_idx    on public.alerts (status, created_at desc);
create index alerts_open_entity_idx       on public.alerts (type, delivery_id, vehicle_id, driver_id) where status = 'aberto';
create index notification_log_alert_idx   on public.notification_log (alert_id);
