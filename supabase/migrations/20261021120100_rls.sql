-- 0002 · RLS: helpers de papel, políticas por perfil (matriz da seção 3) e Storage "pod"

-- Helpers. security definer: leem profiles/drivers/routes sem passar pelo RLS
-- (evita recursão infinita nas políticas de profiles e subconsultas caras).
create or replace function public.auth_role() returns public.app_role
language sql stable security definer set search_path = '' as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as
$$ select coalesce(public.auth_role() in ('admin','gestor_frota','despachante'), false) $$;

create or replace function public.my_driver_id() returns uuid
language sql stable security definer set search_path = '' as
$$ select id from public.drivers where profile_id = auth.uid() $$;

create or replace function public.my_vehicle_id() returns uuid
language sql stable security definer set search_path = '' as
$$ select vehicle_id from public.drivers where profile_id = auth.uid() $$;

create or replace function public.is_my_route(p_route uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.routes r
                   where r.id = p_route and r.driver_id = public.my_driver_id()) $$;

create or replace function public.is_my_delivery(p_delivery uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.deliveries d join public.routes r on r.id = d.route_id
                   where d.id = p_delivery and r.driver_id = public.my_driver_id()) $$;

alter table public.profiles          enable row level security;
alter table public.vehicles          enable row level security;
alter table public.drivers           enable row level security;
alter table public.routes            enable row level security;
alter table public.deliveries        enable row level security;
alter table public.vehicle_positions enable row level security;
alter table public.pods              enable row level security;
alter table public.alerts            enable row level security;
alter table public.notification_log  enable row level security;
alter table public.settings          enable row level security;

-- profiles: cada um lê o seu; equipe lê todos; só admin altera/exclui.
-- Sem policy de insert: o perfil nasce pelo trigger handle_new_user (security definer).
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.is_staff()));
create policy profiles_upd on public.profiles for update to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy profiles_del on public.profiles for delete to authenticated
  using ((select public.auth_role()) = 'admin');

-- vehicles: admin/gestor E; despachante L; motorista L do próprio
create policy veh_sel on public.vehicles for select to authenticated
  using ((select public.is_staff()) or id = (select public.my_vehicle_id()));
create policy veh_ins on public.vehicles for insert to authenticated
  with check ((select public.auth_role()) in ('admin','gestor_frota'));
create policy veh_upd on public.vehicles for update to authenticated
  using ((select public.auth_role()) in ('admin','gestor_frota'))
  with check ((select public.auth_role()) in ('admin','gestor_frota'));
create policy veh_del on public.vehicles for delete to authenticated
  using ((select public.auth_role()) in ('admin','gestor_frota'));

-- drivers: admin/gestor E; despachante L; motorista L do próprio
create policy drv_sel on public.drivers for select to authenticated
  using ((select public.is_staff()) or profile_id = auth.uid());
create policy drv_ins on public.drivers for insert to authenticated
  with check ((select public.auth_role()) in ('admin','gestor_frota'));
create policy drv_upd on public.drivers for update to authenticated
  using ((select public.auth_role()) in ('admin','gestor_frota'))
  with check ((select public.auth_role()) in ('admin','gestor_frota'));
create policy drv_del on public.drivers for delete to authenticated
  using ((select public.auth_role()) in ('admin','gestor_frota'));

-- routes: admin/despachante E; gestor L; motorista L das suas (iniciar via RPC start_route)
create policy rt_sel on public.routes for select to authenticated
  using ((select public.is_staff()) or driver_id = (select public.my_driver_id()));
create policy rt_ins on public.routes for insert to authenticated
  with check ((select public.auth_role()) in ('admin','despachante'));
create policy rt_upd on public.routes for update to authenticated
  using ((select public.auth_role()) in ('admin','despachante'))
  with check ((select public.auth_role()) in ('admin','despachante'));
create policy rt_del on public.routes for delete to authenticated
  using ((select public.auth_role()) in ('admin','despachante'));

-- deliveries: admin/despachante E; gestor L; motorista L das suas rotas (status muda pelo trigger do POD)
create policy del_sel on public.deliveries for select to authenticated
  using ((select public.is_staff()) or public.is_my_route(route_id));
create policy del_ins on public.deliveries for insert to authenticated
  with check ((select public.auth_role()) in ('admin','despachante'));
create policy del_upd on public.deliveries for update to authenticated
  using ((select public.auth_role()) in ('admin','despachante'))
  with check ((select public.auth_role()) in ('admin','despachante'));
create policy del_del on public.deliveries for delete to authenticated
  using ((select public.auth_role()) in ('admin','despachante'));

-- vehicle_positions: equipe L; motorista grava/lê só o próprio veículo (e só nas suas rotas); admin exclui
create policy pos_sel on public.vehicle_positions for select to authenticated
  using ((select public.is_staff()) or vehicle_id = (select public.my_vehicle_id()));
create policy pos_ins on public.vehicle_positions for insert to authenticated
  with check ((select public.auth_role()) = 'admin'
    or (vehicle_id = (select public.my_vehicle_id())
        and (route_id is null or public.is_my_route(route_id))));
create policy pos_del on public.vehicle_positions for delete to authenticated
  using ((select public.auth_role()) = 'admin');

-- pods: admin E; gestor/despachante L; motorista cria/lê nas suas entregas
create policy pod_sel on public.pods for select to authenticated
  using ((select public.is_staff()) or driver_id = (select public.my_driver_id()));
create policy pod_ins on public.pods for insert to authenticated
  with check ((select public.auth_role()) = 'admin'
    or (driver_id = (select public.my_driver_id()) and public.is_my_delivery(delivery_id)));
create policy pod_upd on public.pods for update to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy pod_del on public.pods for delete to authenticated
  using ((select public.auth_role()) = 'admin');

-- alerts: equipe E; motorista sem acesso
create policy al_sel on public.alerts for select to authenticated using ((select public.is_staff()));
create policy al_ins on public.alerts for insert to authenticated with check ((select public.is_staff()));
create policy al_upd on public.alerts for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy al_del on public.alerts for delete to authenticated using ((select public.is_staff()));

-- notification_log: equipe L/insere; admin exclui
create policy nl_sel on public.notification_log for select to authenticated using ((select public.is_staff()));
create policy nl_ins on public.notification_log for insert to authenticated with check ((select public.is_staff()));
create policy nl_del on public.notification_log for delete to authenticated
  using ((select public.auth_role()) = 'admin');

-- settings: todo logado lê (limites, depósito); só admin escreve
create policy st_sel on public.settings for select to authenticated using (true);
create policy st_ins on public.settings for insert to authenticated
  with check ((select public.auth_role()) = 'admin');
create policy st_upd on public.settings for update to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy st_del on public.settings for delete to authenticated
  using ((select public.auth_role()) = 'admin');

-- Storage: bucket privado "pod" (fotos/assinaturas), até 5 MB, só imagens. Caminho: {delivery_id}/{arquivo}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pod', 'pod', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Comparação como texto: um cast ::uuid quebraria a policy com erro em pastas inválidas.
create policy pod_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pod' and (
    (select public.auth_role()) = 'admin'
    or exists (select 1 from public.deliveries d join public.routes r on r.id = d.route_id
                where d.id::text = (storage.foldername(objects.name))[1]
                  and r.driver_id = (select public.my_driver_id()))));
create policy pod_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'pod' and (
    (select public.is_staff())
    or exists (select 1 from public.deliveries d join public.routes r on r.id = d.route_id
                where d.id::text = (storage.foldername(objects.name))[1]
                  and r.driver_id = (select public.my_driver_id()))));
create policy pod_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'pod' and (select public.auth_role()) = 'admin');
