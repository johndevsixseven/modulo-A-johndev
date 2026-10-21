-- Seed (PLANO.md seção 8). Dados 100% fictícios. Determinístico: "aleatoriedade" vem de hashtext(código),
-- então a mesma data gera os mesmos dados. Datas são relativas a hoje (America/Sao_Paulo).
-- Reexecutável: chaves fixas + "on conflict do nothing". Usuários: scripts/seed-users.mjs.

-- Veículos: 2 motos, 2 vans, 1 utilitário, 1 caminhão leve; 102 com manutenção em 3 dias; 104 em manutenção
insert into public.vehicles (id, plate, type, capacity_kg, capacity_m3, range_km, cost_per_km, status, next_maintenance) values
 ('00000000-0000-4000-8000-000000000101', 'SEN1A01', 'moto',          30,   0.15, 150, 0.60, 'disponivel',    (now() at time zone 'America/Sao_Paulo')::date + 45),
 ('00000000-0000-4000-8000-000000000102', 'SEN1A02', 'moto',          30,   0.15, 150, 0.60, 'disponivel',    (now() at time zone 'America/Sao_Paulo')::date + 3),
 ('00000000-0000-4000-8000-000000000103', 'SEN2B03', 'van',         1200,   8.00, 400, 1.80, 'disponivel',    (now() at time zone 'America/Sao_Paulo')::date + 60),
 ('00000000-0000-4000-8000-000000000104', 'SEN2B04', 'van',         1200,   8.00, 400, 1.80, 'em_manutencao', (now() at time zone 'America/Sao_Paulo')::date + 2),
 ('00000000-0000-4000-8000-000000000105', 'SEN3C05', 'utilitario',   650,   3.50, 350, 1.20, 'disponivel',    (now() at time zone 'America/Sao_Paulo')::date + 30),
 ('00000000-0000-4000-8000-000000000106', 'SEN4D06', 'caminhao_leve', 3000, 15.00, 500, 2.60, 'disponivel',   (now() at time zone 'America/Sao_Paulo')::date + 90)
on conflict (id) do nothing;

-- Motoristas: 5 vinculados (104 em manutenção fica sem motorista), 202 com CNH vencendo em 15 dias.
-- 203 é o motorista de teste (scripts/seed-users.mjs vincula o login a ele).
insert into public.drivers (id, name, cnh_category, cnh_expiry, phone, vehicle_id, consent_at, consent_purpose) values
 ('00000000-0000-4000-8000-000000000201', 'Rafael Moreira (fictício)',  'AB', (now() at time zone 'America/Sao_Paulo')::date + 400, '11900000001', '00000000-0000-4000-8000-000000000101', now(), 'Gestão da frota e rastreamento durante a jornada'),
 ('00000000-0000-4000-8000-000000000202', 'Juliana Prado (fictícia)',   'AB', (now() at time zone 'America/Sao_Paulo')::date + 15,  '11900000002', '00000000-0000-4000-8000-000000000102', now(), 'Gestão da frota e rastreamento durante a jornada'),
 ('00000000-0000-4000-8000-000000000203', 'Marcos Teixeira (fictício)', 'B',  (now() at time zone 'America/Sao_Paulo')::date + 700, '11900000003', '00000000-0000-4000-8000-000000000103', now(), 'Gestão da frota e rastreamento durante a jornada'),
 ('00000000-0000-4000-8000-000000000204', 'Fernanda Lopes (fictícia)',  'B',  (now() at time zone 'America/Sao_Paulo')::date + 250, '11900000004', '00000000-0000-4000-8000-000000000105', now(), 'Gestão da frota e rastreamento durante a jornada'),
 ('00000000-0000-4000-8000-000000000205', 'Paulo Dias (fictício)',      'C',  (now() at time zone 'America/Sao_Paulo')::date + 500, '11900000005', '00000000-0000-4000-8000-000000000106', now(), 'Gestão da frota e rastreamento durante a jornada'),
 ('00000000-0000-4000-8000-000000000206', 'Beatriz Nunes (fictícia)',   'B',  (now() at time zone 'America/Sao_Paulo')::date + 320, '11900000006', null,                                   now(), 'Gestão da frota e rastreamento durante a jornada')
on conflict (id) do nothing;

-- Histórico de 60 dias: volume por região × dia da semana (seg/sex altos, domingo baixo) × tendência de alta.
-- ~8% falha (Zona Leste ~16%); das entregues, ~85% dentro da janela.
drop table if exists _hist;
create temp table _hist as
with dias as (
  select g as ago, (now() at time zone 'America/Sao_Paulo')::date - g as dia
    from generate_series(1, 60) g),
reg (region, rc, w, rlat, rlng, fail) as (values
  ('Centro',     'C', 1.3, -23.550, -46.633,  6),
  ('Zona Norte', 'N', 0.9, -23.480, -46.620,  6),
  ('Zona Sul',   'S', 1.1, -23.650, -46.700,  5),
  ('Zona Leste', 'L', 1.0, -23.540, -46.470, 16),
  ('Zona Oeste', 'O', 0.7, -23.560, -46.720,  5)),
qt as (
  select d.dia, d.ago, r.*,
         round(4.5 * r.w
               * case extract(isodow from d.dia) when 1 then 1.2 when 5 then 1.2 when 6 then 0.8 when 7 then 0.6 else 1.0 end
               * (1 + (60 - d.ago) / 60.0 * 0.15)
               * (0.85 + (abs(hashtext(d.dia::text || r.rc)::bigint) % 31) / 100.0))::int as n
    from dias d cross join reg r),
base as (
  select q.*, 'HIS-' || to_char(q.dia, 'YYMMDD') || '-' || q.rc || lpad(i::text, 2, '0') as code
    from qt q cross join lateral generate_series(1, q.n) i),
hh as (
  select b.*, abs(hashtext(b.code)::bigint) as h, abs(hashtext(b.code || '#')::bigint) as h2
    from base b),
calc as (
  select hh.*, (hh.h % 10)::int as slot,
         ((hh.dia + time '08:00') + make_interval(hours => ((hh.h / 10) % 9)::int)) at time zone 'America/Sao_Paulo' as ws,
         ((hh.h2 / 7) % 100) < hh.fail as failed,
         ((hh.h2 / 13) % 100) < 15 as late,
         make_interval(mins => ((hh.h2 / 17) % 170 + 5)::int) as ontime_off,
         make_interval(mins => ((hh.h2 / 17) % 60 + 10)::int) as late_off
    from hh)
select c.code, c.dia, c.region, c.h, c.h2, c.ws,
       (c.rlat + (((c.h / 100) % 1000) / 1000.0 - 0.5) * 0.06)::float8 as lat,
       (c.rlng + (((c.h2 / 100) % 1000) / 1000.0 - 0.5) * 0.06)::float8 as lng,
       (case when c.slot < 2 then '00000000-0000-4000-8000-000000000101'
             when c.slot < 4 then '00000000-0000-4000-8000-000000000102'
             when c.slot < 7 then '00000000-0000-4000-8000-000000000103'
             when c.slot < 9 then '00000000-0000-4000-8000-000000000105'
             else                 '00000000-0000-4000-8000-000000000106' end)::uuid as vid,
       (case when c.slot < 2 then '00000000-0000-4000-8000-000000000201'
             when c.slot < 4 then '00000000-0000-4000-8000-000000000202'
             when c.slot < 7 then '00000000-0000-4000-8000-000000000203'
             when c.slot < 9 then '00000000-0000-4000-8000-000000000204'
             else                 '00000000-0000-4000-8000-000000000205' end)::uuid as did,
       case when c.slot < 4 then 0.5 + (c.h2 % 40) / 10.0 else 2 + (c.h2 % 380) / 10.0 end as weight,
       case when c.slot < 4 then 0.005 + (c.h2 % 20) / 1000.0 else 0.02 + (c.h2 % 300) / 1000.0 end as volume,
       case when (c.h2 / 19) % 20 = 0 then 'urgente' when (c.h2 / 19) % 20 < 4 then 'alta'
            when (c.h2 / 19) % 20 < 16 then 'normal' else 'baixa' end as priority,
       case when c.failed then 'falha' else 'entregue' end as status,
       case when c.failed then null
            when c.late then c.ws + interval '3 hours' + c.late_off
            else c.ws + c.ontime_off end as delivered_at,
       case when c.failed or not c.late then c.ws + c.ontime_off else c.ws + interval '3 hours' + c.late_off end as done_at,
       case when c.failed then (array['Destinatário ausente','Endereço não localizado','Recusado pelo destinatário'])[1 + (c.h % 3)::int] end as failure_reason,
       (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Hugo','Isabela','João','Karen','Lucas'])[1 + (c.h % 12)::int]
         || ' ' || (array['Alves','Barros','Campos','Duarte','Esteves','Freitas','Gomes','Haddad','Ignácio','Jardim','Klein','Leal'])[1 + (c.h2 % 12)::int]
         || ' (fictício)' as recipient,
       'Rua Fictícia ' || (1 + c.h % 900) || ', ' || c.region || ', São Paulo' as address
  from calc c;

insert into public.routes (id, name, route_date, vehicle_id, driver_id, status, released_at, started_at, finished_at, created_at)
select md5('rt' || h.dia::text || h.vid::text)::uuid,
       'Rota ' || to_char(h.dia, 'DD/MM') || ' · ' || v.plate, h.dia, h.vid, h.did, 'concluida',
       min(h.ws) - interval '90 minutes', min(h.ws) - interval '60 minutes',
       max(h.done_at) + interval '45 minutes', min(h.ws) - interval '1 day'
  from _hist h join public.vehicles v on v.id = h.vid
 group by h.dia, h.vid, h.did, v.plate
on conflict (id) do nothing;

insert into public.deliveries (code, recipient_name, address, region, lat, lng, window_start, window_end,
                               weight_kg, volume_m3, priority, status, route_id, stop_order, eta,
                               delivered_at, consent, created_at)
select h.code, h.recipient, h.address, h.region, h.lat, h.lng, h.ws, h.ws + interval '3 hours',
       h.weight, h.volume, h.priority::public.priority_level, h.status::public.delivery_status,
       md5('rt' || h.dia::text || h.vid::text)::uuid,
       row_number() over (partition by h.dia, h.vid order by h.ws, h.code),
       h.ws + interval '30 minutes', h.delivered_at, true, h.ws - interval '1 day'
  from _hist h
on conflict (code) do nothing;

-- POD de cada entrega histórica (o trigger regrava o mesmo status; a rota já está concluída)
insert into public.pods (delivery_id, driver_id, result, failure_reason, method, code, lat, lng, recorded_at)
select d.id, h.did, h.status::public.delivery_status, h.failure_reason,
       (case when h.status = 'entregue' then 'codigo' end)::public.pod_method,
       case when h.status = 'entregue' then lpad((h.h % 10000)::text, 4, '0') end,
       d.lat, d.lng, h.done_at
  from _hist h join public.deliveries d on d.code = h.code
on conflict (delivery_id) do nothing;

-- km (haversine × fator_rua 1,3), tempo, custo, carga e geometria (depósito → paradas → depósito)
with pts as (
  select d.route_id, d.stop_order, d.lat, d.lng, d.weight_kg,
         lag(d.lat) over w as plat, lag(d.lng) over w as plng,
         row_number() over w as rn, count(*) over (partition by d.route_id) as n
    from public.deliveries d
   where d.route_id is not null and d.code like 'HIS-%'
  window w as (partition by d.route_id order by d.stop_order)),
agg as (
  select route_id, count(*) as n, sum(weight_kg) as kg,
         1.3 / 1000 * sum(public.dist_m(coalesce(plat, -23.5505), coalesce(plng, -46.6333), lat, lng)
                          + case when rn = n then public.dist_m(lat, lng, -23.5505, -46.6333) else 0 end) as km,
         jsonb_build_array(jsonb_build_array(-23.5505, -46.6333))
           || jsonb_agg(jsonb_build_array(lat, lng) order by stop_order)
           || jsonb_build_array(jsonb_build_array(-23.5505, -46.6333)) as geom
    from pts group by route_id)
update public.routes r
   set load_kg   = a.kg,
       total_km  = round(a.km::numeric, 2),
       total_min = round(a.km / 25 * 60 + a.n * 5)::int,
       est_cost  = round((a.km * v.cost_per_km)::numeric, 2),
       geometry  = a.geom
  from agg a, public.vehicles v
 where r.id = a.route_id and v.id = r.vehicle_id;

drop table _hist;

-- Hoje: 30 pedidos pendentes. PED-0001/0002 com janela vencida (alerta de atraso);
-- PED-0003 urgente com janela de 40 min (risco crítico). Demais a partir da próxima hora (mín. 08:00).
with t as (
  select greatest(date_trunc('hour', now()) + interval '1 hour',
                  ((now() at time zone 'America/Sao_Paulo')::date + time '08:00') at time zone 'America/Sao_Paulo') as t0),
reg (k, region, rlat, rlng) as (values
  (0, 'Centro', -23.550, -46.633), (1, 'Zona Norte', -23.480, -46.620), (2, 'Zona Sul', -23.650, -46.700),
  (3, 'Zona Leste', -23.540, -46.470), (4, 'Zona Oeste', -23.560, -46.720)),
s as (
  select i, 'PED-' || lpad(i::text, 4, '0') as code, abs(hashtext('PED' || i)::bigint) as h
    from generate_series(1, 30) i)
insert into public.deliveries (code, recipient_name, address, region, lat, lng, window_start, window_end,
                               weight_kg, volume_m3, priority, consent)
select s.code,
       (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Hugo','Isabela','João','Karen','Lucas'])[1 + (s.h % 12)::int]
         || ' ' || (array['Alves','Barros','Campos','Duarte','Esteves','Freitas','Gomes','Haddad','Ignácio','Jardim','Klein','Leal'])[1 + ((s.h / 12) % 12)::int]
         || ' (fictício)',
       'Rua Fictícia ' || (1 + s.h % 900) || ', ' || r.region || ', São Paulo',
       r.region,
       (r.rlat + (((s.h / 100) % 1000) / 1000.0 - 0.5) * 0.06)::float8,
       (r.rlng + (((s.h / 100000) % 1000) / 1000.0 - 0.5) * 0.06)::float8,
       case when s.i <= 2 then now() - interval '4 hours'
            when s.i = 3  then now()
            else t.t0 + make_interval(hours => (s.i - 4) % 6) end,
       case when s.i <= 2 then now() - interval '30 minutes'
            when s.i = 3  then now() + interval '40 minutes'
            else t.t0 + make_interval(hours => (s.i - 4) % 6 + 3 + s.i % 2) end,
       case when s.i % 7 = 0 then 1.5 else 2 + (s.i * 37) % 23 end,
       0.01 + ((s.i * 13) % 19) / 100.0,
       (case when s.i = 3 then 'urgente' when s.i % 9 = 0 then 'alta' else 'normal' end)::public.priority_level,
       true
  from s cross join t join reg r on r.k = s.i % 5
on conflict (code) do nothing;

-- Posições: trajeto das rotas de ontem (dá última posição aos veículos e conteúdo a vehicle_positions)
insert into public.vehicle_positions (vehicle_id, route_id, lat, lng, speed_kmh, recorded_at)
select r.vehicle_id, r.id, (e.p->>0)::float8, (e.p->>1)::float8, 22.5,
       r.started_at + make_interval(mins => (e.ord * 12)::int)
  from public.routes r
  cross join lateral jsonb_array_elements(r.geometry) with ordinality as e(p, ord)
 where r.route_date = (now() at time zone 'America/Sao_Paulo')::date - 1
   and not exists (select 1 from public.vehicle_positions)
 order by r.id, e.ord;

-- Alertas iniciais (atraso PED-0001/0002, manutenção SEN1A02, CNH de 202) + notification_log
select public.check_alerts();
