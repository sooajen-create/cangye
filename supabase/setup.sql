-- 藏页：在 Supabase SQL Editor 执行。
-- 先在 Authentication > Users 创建你自己的账号，复制 UUID。
-- 只替换下面这一处 UUID，再执行整个文件。不要使用邮箱代替 UUID。
begin;
create table public.cangye_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
insert into public.cangye_owner(singleton,user_id)
values(true, 'REPLACE_WITH_YOUR_AUTH_USER_UUID'::uuid);
alter table public.cangye_owner enable row level security;
revoke all on public.cangye_owner from anon,authenticated;

create function public.cangye_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.cangye_owner where user_id=auth.uid()); $$;
revoke all on function public.cangye_is_owner() from public;
grant execute on function public.cangye_is_owner() to authenticated;

create table public.works (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  owner_id uuid not null references auth.users(id),
  data jsonb not null check (jsonb_typeof(data)='object' and data ? 'title' and data ? 'chapters'),
  revision integer not null default 1 check (revision > 0),
  reading jsonb not null default '{}'::jsonb,
  original jsonb,
  updated_at timestamptz not null default now()
);
alter table public.works enable row level security;
revoke all on public.works from anon;
grant select,insert,update,delete on public.works to authenticated;
create policy "Only the designated owner can access works"
on public.works for all to authenticated
using (public.cangye_is_owner() and owner_id=(select auth.uid()))
with check (public.cangye_is_owner() and owner_id=(select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit)
values ('library','library',false,20971520);
create policy "Private originals only for designated owner"
on storage.objects for all to authenticated
using(bucket_id='library' and public.cangye_is_owner() and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='library' and public.cangye_is_owner() and (storage.foldername(name))[1]=(select auth.uid())::text);

-- 自动提取限流：每分钟 12 次、每天 500 次。只开放给唯一用户。
create table public.cangye_import_rate (
  user_id uuid primary key references auth.users(id),
  minute_start timestamptz not null,
  minute_count integer not null default 0,
  day_start date not null,
  day_count integer not null default 0
);
alter table public.cangye_import_rate enable row level security;
revoke all on public.cangye_import_rate from anon,authenticated;
create function public.cangye_take_import_slot() returns boolean
language plpgsql security definer set search_path = '' as $$
declare accepted boolean;
begin
  if not public.cangye_is_owner() then return false; end if;
  insert into public.cangye_import_rate(user_id,minute_start,minute_count,day_start,day_count)
  values(auth.uid(),date_trunc('minute',now()),1,current_date,1)
  on conflict (user_id) do update set
    minute_start=date_trunc('minute',now()),
    minute_count=case when public.cangye_import_rate.minute_start=date_trunc('minute',now()) then public.cangye_import_rate.minute_count+1 else 1 end,
    day_start=current_date,
    day_count=case when public.cangye_import_rate.day_start=current_date then public.cangye_import_rate.day_count+1 else 1 end
  where (public.cangye_import_rate.minute_start<>date_trunc('minute',now()) or public.cangye_import_rate.minute_count<12)
    and (public.cangye_import_rate.day_start<>current_date or public.cangye_import_rate.day_count<500)
  returning true into accepted;
  return coalesce(accepted,false);
end; $$;
revoke all on function public.cangye_take_import_slot() from public;
grant execute on function public.cangye_take_import_slot() to authenticated;
commit;
