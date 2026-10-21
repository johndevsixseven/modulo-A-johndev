-- 0003 · Triggers, RPCs, alertas, LGPD, Realtime e configurações padrão (PLANO.md seção 4.3)
-- Funções security definer usam search_path = '' e nomes qualificados (evita sequestro de search_path).

-- 1) Novo usuário → profile 'motorista' (perfil real definido pelo admin via admin-users / seed-users)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Distância em metros (haversine) e distância ponto → polilinha de routes.geometry
create or replace function public.dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
       + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) $$;

-- Projeção equirretangular centrada no ponto (erro desprezível nas distâncias de uma cidade).
create or replace function public.dist_to_route_m(p_route uuid, p_lat float8, p_lng float8) returns float8
language plpgsql stable set search_path = '' as $$
declare
  g jsonb; n int;
  k  float8 := 6371000 * pi() / 180;
  c  float8 := cos(radians(p_lat));
  x1 float8; y1 float8; x2 float8; y2 float8; dx float8; dy float8; t float8;
  best float8;
begin
  select geometry into g from public.routes where id = p_route;
  if g is null or jsonb_typeof(g) <> 'array' then return null; end if;
  n := jsonb_array_length(g);
  if n = 0 then return null; end if;
  if n = 1 then
    return public.dist_m(p_lat, p_lng, (g->0->>0)::float8, (g->0->>1)::float8);
  end if;
  for i in 0 .. n - 2 loop
    y1 := ((g->i->>0)::float8 - p_lat) * k;       x1 := ((g->i->>1)::float8 - p_lng) * k * c;
    y2 := ((g->(i+1)->>0)::float8 - p_lat) * k;   x2 := ((g->(i+1)->>1)::float8 - p_lng) * k * c;
    dx := x2 - x1; dy := y2 - y1;
    t := case when dx * dx + dy * dy = 0 then 0
              else greatest(0, least(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) end;
    best := least(best, sqrt(power(x1 + t * dx, 2) + power(y1 + t * dy, 2)));  -- least ignora null
  end loop;
  return best;
end $$;

-- 3) Posição recebida → atualiza veículo; "andou" = > 100 m da posição em que se moveu por último
--    (comparar só com a posição anterior nunca detectaria movimento lento a cada 10 s); fora da rota → alerta.
create or replace function public.on_position_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_moved_at timestamptz; a_lat float8; a_lng float8; moved boolean;
  lim jsonb; d float8;
begin
  select last_moved_at into v_moved_at from public.vehicles where id = new.vehicle_id;

  select p.lat, p.lng into a_lat, a_lng
    from public.vehicle_positions p
   where p.vehicle_id = new.vehicle_id and p.id <> new.id
     and v_moved_at is not null and p.recorded_at <= v_moved_at
   order by p.recorded_at desc limit 1;
  moved := a_lat is null or public.dist_m(a_lat, a_lng, new.lat, new.lng) > 100;

  update public.vehicles
     set last_lat = new.lat, last_lng = new.lng,
         last_seen_at = greatest(coalesce(last_seen_at, new.recorded_at), new.recorded_at),
         last_moved_at = case when moved then new.recorded_at else last_moved_at end
   where id = new.vehicle_id;

  if new.route_id is not null
     and exists (select 1 from public.routes where id = new.route_id and status = 'em_andamento') then
    select value into lim from public.settings where key = 'alertas';
    d := public.dist_to_route_m(new.route_id, new.lat, new.lng);
    if d > coalesce((lim->>'fora_rota_m')::float8, 1000)
       and not exists (select 1 from public.alerts a
                        where a.type = 'fora_da_rota' and a.status = 'aberto'
                          and a.vehicle_id = new.vehicle_id and a.route_id = new.route_id) then
      with ins as (
        insert into public.alerts (type, severity, title, message, vehicle_id, route_id)
        select 'fora_da_rota', 'alta', 'Veículo ' || v.plate || ' fora da rota',
               'Distância da rota planejada: ' || round(d::numeric) || ' m', v.id, new.route_id
          from public.vehicles v where v.id = new.vehicle_id
        returning id)
      insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
    end if;
  end if;
  return null;
end $$;

create trigger vehicle_positions_after_insert after insert on public.vehicle_positions
  for each row execute function public.on_position_insert();

-- 4) POD: data/hora do servidor quando vem de usuário (seed/backup preservam a original);
--    depois atualiza a entrega e conclui a rota quando todas terminarem.
create or replace function public.pod_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then new.recorded_at := now(); end if;
  return new;
end $$;

create or replace function public.pod_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r uuid; v uuid;
begin
  update public.deliveries
     set status = new.result,
         delivered_at = case when new.result = 'entregue' then new.recorded_at end
   where id = new.delivery_id
  returning route_id into r;

  if r is not null and not exists (
       select 1 from public.deliveries
        where route_id = r and status not in ('entregue','falha','cancelada')) then
    update public.routes set status = 'concluida', finished_at = now()
     where id = r and status in ('liberada','em_andamento')
    returning vehicle_id into v;
    if v is not null then
      update public.vehicles set status = 'disponivel' where id = v and status = 'em_rota';
    end if;
  end if;
  return null;
end $$;

create trigger pods_before_insert before insert on public.pods
  for each row execute function public.pod_before_insert();
create trigger pods_after_insert after insert on public.pods
  for each row execute function public.pod_after_insert();

-- 5) RPC release_route [admin, despachante]
create or replace function public.release_route(p_route uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if coalesce(public.auth_role()::text, '') not in ('admin','despachante') then
    raise exception 'Sem permissão para liberar rotas' using errcode = '42501';
  end if;
  update public.routes set status = 'liberada', released_at = now()
   where id = p_route and status = 'rascunho' and vehicle_id is not null and driver_id is not null
  returning vehicle_id into v;
  if not found then
    raise exception 'Rota inexistente, já liberada ou sem veículo/motorista' using errcode = 'P0002';
  end if;
  update public.deliveries set status = 'planejada' where route_id = p_route and status = 'pendente';
  update public.vehicles set status = 'em_rota' where id = v;
end $$;

-- 6) RPC start_route [motorista dono da rota; admin para teste]
create or replace function public.start_route(p_route uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  update public.routes set status = 'em_andamento', started_at = now()
   where id = p_route and status = 'liberada'
     and (driver_id = public.my_driver_id() or public.auth_role() = 'admin')
  returning vehicle_id into v;
  if not found then
    raise exception 'Rota não encontrada, não liberada ou de outro motorista' using errcode = 'P0002';
  end if;
  update public.deliveries set status = 'a_caminho' where route_id = p_route and status = 'planejada';
  update public.vehicles set last_moved_at = now() where id = v;  -- não nasce "parado"
end $$;

-- 7) RPC check_alerts [equipe; pg_cron/service_role sem JWT] → nº de alertas criados.
--    Não duplica alerta 'aberto' do mesmo tipo + entidade. Grava notification_log(channel='painel').
create or replace function public.check_alerts() returns int
language plpgsql security definer set search_path = '' as $$
declare
  lim jsonb; n int := 0; c int;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select coalesce(value, '{}'::jsonb) into lim from public.settings where key = 'alertas';
  lim := coalesce(lim, '{}'::jsonb);

  with ins as (
    insert into public.alerts (type, severity, title, message, delivery_id, route_id)
    select 'entrega_atrasada', 'alta', 'Entrega ' || d.code || ' atrasada',
           'Janela encerrou às ' || to_char(d.window_end at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           d.id, d.route_id
      from public.deliveries d
     where d.status in ('pendente','planejada','a_caminho') and d.window_end < now()
       and not exists (select 1 from public.alerts a where a.delivery_id = d.id
                        and a.type = 'entrega_atrasada' and a.status = 'aberto')
    returning id)
  insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
  get diagnostics c = row_count; n := n + c;

  with ins as (
    insert into public.alerts (type, severity, title, message, vehicle_id)
    select 'veiculo_parado', 'media', 'Veículo ' || v.plate || ' parado',
           'Sem deslocamento desde ' || to_char(coalesce(v.last_moved_at, v.last_seen_at) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           v.id
      from public.vehicles v
     where v.status = 'em_rota'
       and coalesce(v.last_moved_at, v.last_seen_at)
           < now() - make_interval(mins => coalesce((lim->>'parado_min')::int, 20))
       and not exists (select 1 from public.alerts a where a.vehicle_id = v.id
                        and a.type = 'veiculo_parado' and a.status = 'aberto')
    returning id)
  insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
  get diagnostics c = row_count; n := n + c;

  with ins as (
    insert into public.alerts (type, severity, title, message, vehicle_id)
    select 'manutencao_vencendo', case when v.next_maintenance < hoje then 'alta' else 'media' end::public.alert_severity,
           'Manutenção do veículo ' || v.plate,
           'Manutenção prevista para ' || to_char(v.next_maintenance, 'DD/MM/YYYY'), v.id
      from public.vehicles v
     where v.status <> 'em_manutencao'
       and v.next_maintenance <= hoje + coalesce((lim->>'manutencao_dias')::int, 7)
       and not exists (select 1 from public.alerts a where a.vehicle_id = v.id
                        and a.type = 'manutencao_vencendo' and a.status = 'aberto')
    returning id)
  insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
  get diagnostics c = row_count; n := n + c;

  with ins as (
    insert into public.alerts (type, severity, title, message, driver_id)
    select 'cnh_vencendo', case when dr.cnh_expiry < hoje then 'alta' else 'media' end::public.alert_severity,
           'CNH de ' || dr.name || ' vencendo',
           'CNH vence em ' || to_char(dr.cnh_expiry, 'DD/MM/YYYY'), dr.id
      from public.drivers dr
     where dr.anonymized_at is null
       and dr.cnh_expiry <= hoje + coalesce((lim->>'cnh_dias')::int, 30)
       and not exists (select 1 from public.alerts a where a.driver_id = dr.id
                        and a.type = 'cnh_vencendo' and a.status = 'aberto')
    returning id)
  insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
  get diagnostics c = row_count; n := n + c;

  -- risco_alto: usa a pontuação gravada pelo front (risk.js) em deliveries.risk_score
  with ins as (
    insert into public.alerts (type, severity, title, message, delivery_id, route_id)
    select 'risco_alto', 'alta', 'Risco de atraso: ' || d.code,
           'Pontuação de risco ' || d.risk_score, d.id, d.route_id
      from public.deliveries d
     where d.status in ('pendente','planejada','a_caminho')
       and d.risk_score >= coalesce((lim->>'risco_critico')::int, 60)
       and not exists (select 1 from public.alerts a where a.delivery_id = d.id
                        and a.type = 'risco_alto' and a.status = 'aberto')
    returning id)
  insert into public.notification_log (alert_id, channel, success) select id, 'painel', true from ins;
  get diagnostics c = row_count; n := n + c;

  return n;
end $$;

-- 8) RPC dashboard_kpis (security invoker: o RLS de quem chama vale). Fórmulas da seção 0.
--    Período pela data local de window_start; com filtro de região, km/custo/ocupação consideram
--    as rotas que têm ao menos uma entrega na região.
create or replace function public.dashboard_kpis(p_from date, p_to date, p_region text default null)
returns jsonb language sql stable set search_path = '' as $$
  with d as (
    select * from public.deliveries
     where (window_start at time zone 'America/Sao_Paulo')::date between p_from and p_to
       and (p_region is null or region = p_region)),
  fin as (
    select count(*) filter (where status in ('entregue','falha')) as finalizadas,
           count(*) filter (where status = 'entregue' and delivered_at <= window_end) as no_prazo,
           count(*) as total
      from d),
  rts as (
    select r.* from public.routes r
     where r.route_date between p_from and p_to and r.status in ('em_andamento','concluida')
       and (p_region is null or exists (select 1 from d where d.route_id = r.id))),
  rk as (
    select coalesce(sum(rts.total_km), 0) as km,
           coalesce(sum(rts.total_km * v.cost_per_km), 0) as custo,
           coalesce(sum(rts.load_kg), 0) as carga,
           coalesce(sum(v.capacity_kg), 0) as cap
      from rts left join public.vehicles v on v.id = rts.vehicle_id)
  select jsonb_build_object(
    'otd',               case when fin.finalizadas > 0 then round(fin.no_prazo::numeric / fin.finalizadas, 4) end,
    'custo_por_entrega', case when fin.finalizadas > 0 then round(rk.custo / fin.finalizadas, 2) end,
    'km_rodados',        round(rk.km, 2),
    'ocupacao',          case when rk.cap > 0 then round(rk.carga / rk.cap, 4) end,
    'finalizadas',       fin.finalizadas,
    'total',             fin.total,
    'por_status', coalesce((
       select jsonb_agg(jsonb_build_object('status', s.status, 'total', s.total) order by s.status)
         from (select status, count(*) as total from d group by status) s), '[]'::jsonb),
    'por_regiao', coalesce((
       select jsonb_agg(jsonb_build_object('regiao', s.region, 'total', s.total, 'entregues', s.ent,
                                           'falhas', s.fal, 'no_prazo', s.np) order by s.region)
         from (select region, count(*) as total,
                      count(*) filter (where status = 'entregue') as ent,
                      count(*) filter (where status = 'falha') as fal,
                      count(*) filter (where status = 'entregue' and delivered_at <= window_end) as np
                 from d group by region) s), '[]'::jsonb),
    'por_dia', coalesce((
       select jsonb_agg(jsonb_build_object('dia', s.dia, 'total', s.total, 'entregues', s.ent,
                                           'falhas', s.fal) order by s.dia)
         from (select (window_start at time zone 'America/Sao_Paulo')::date as dia, count(*) as total,
                      count(*) filter (where status = 'entregue') as ent,
                      count(*) filter (where status = 'falha') as fal
                 from d group by 1) s), '[]'::jsonb))
  from fin, rk
$$;

-- 9) RPC demand_history: entregas por região e dia (data local), últimos p_days dias sem contar hoje
create or replace function public.demand_history(p_days int default 60)
returns table (region text, day date, total int) language sql stable set search_path = '' as $$
  select d.region, (d.window_start at time zone 'America/Sao_Paulo')::date, count(*)::int
    from public.deliveries d
   where d.status <> 'cancelada'
     and d.window_start >= (((now() at time zone 'America/Sao_Paulo')::date - p_days)::timestamp at time zone 'America/Sao_Paulo')
     and d.window_start <  (((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo')
   group by 1, 2
   order by 2, 1
$$;

-- 10) LGPD [admin]. security invoker: o RLS do admin já permite; a checagem dá erro claro.
--     O front apaga os arquivos do Storage antes de chamar (caminhos ficam null aqui).
create or replace function public.anonymize_driver(p uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Somente admin' using errcode = '42501';
  end if;
  update public.drivers
     set name = 'Anonimizado', phone = null, consent_purpose = null, anonymized_at = now()
   where id = p;
end $$;

create or replace function public.anonymize_delivery(p uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Somente admin' using errcode = '42501';
  end if;
  update public.pods
     set photo_path = null, signature_path = null, code = null,
         lat = round(lat::numeric, 2)::float8, lng = round(lng::numeric, 2)::float8
   where delivery_id = p;
  update public.deliveries
     set recipient_name = 'Anonimizado', recipient_phone = null, address = region,
         lat = round(lat::numeric, 2)::float8, lng = round(lng::numeric, 2)::float8,
         anonymized_at = now()
   where id = p;
end $$;

create or replace function public.lgpd_retention(p_days int default 90) returns int
language plpgsql set search_path = '' as $$
declare n int;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Somente admin' using errcode = '42501';
  end if;
  with alvo as (
    select id from public.deliveries
     where anonymized_at is null and status in ('entregue','falha','cancelada')
       and created_at < now() - make_interval(days => p_days)),
  p as (
    update public.pods
       set photo_path = null, signature_path = null, code = null,
           lat = round(lat::numeric, 2)::float8, lng = round(lng::numeric, 2)::float8
     where delivery_id in (select id from alvo))
  update public.deliveries
     set recipient_name = 'Anonimizado', recipient_phone = null, address = region,
         lat = round(lat::numeric, 2)::float8, lng = round(lng::numeric, 2)::float8,
         anonymized_at = now()
   where id in (select id from alvo);
  get diagnostics n = row_count;
  return n;
end $$;

-- Permissões de execução: RPCs só para usuários logados (o Supabase concede EXECUTE ao anon por padrão)
revoke execute on function public.release_route(uuid), public.start_route(uuid), public.check_alerts(),
  public.dashboard_kpis(date, date, text), public.demand_history(int),
  public.anonymize_driver(uuid), public.anonymize_delivery(uuid), public.lgpd_retention(int)
  from public, anon;
grant execute on function public.release_route(uuid), public.start_route(uuid), public.check_alerts(),
  public.dashboard_kpis(date, date, text), public.demand_history(int),
  public.anonymize_driver(uuid), public.anonymize_delivery(uuid), public.lgpd_retention(int)
  to authenticated, service_role;

-- 11) Realtime
alter publication supabase_realtime
  add table public.vehicle_positions, public.deliveries, public.alerts, public.routes;

-- 12) Configurações padrão
insert into public.settings (key, value) values
 ('alertas',      '{"parado_min":20,"fora_rota_m":1000,"manutencao_dias":7,"cnh_dias":30,"risco_critico":60}'),
 ('deposito',     '{"nome":"CD SENN AI-X","lat":-23.5505,"lng":-46.6333}'),
 ('roteirizacao', '{"vel_media_kmh":25,"tempo_parada_min":5,"fator_rua":1.3,"inicio":"08:00"}')
on conflict (key) do nothing;

-- 13) (opcional, se a extensão pg_cron estiver habilitada no projeto):
--     select cron.schedule('alertas', '*/5 * * * *', 'select public.check_alerts()');
