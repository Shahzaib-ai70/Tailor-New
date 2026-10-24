create table if not exists public.products (
  id text primary key,
  name text not null,
  detail text not null default '',
  price integer not null check (price >= 0),
  category text not null,
  image text not null,
  fabric text not null default '',
  stitching text not null default '',
  colorways jsonb not null default '[]'::jsonb,
  tag text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitting_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  occasion text not null,
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null default 'Guest',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists support_conversations_one_open_per_customer
  on public.support_conversations (customer_id) where status = 'open';

alter table public.products enable row level security;
alter table public.fitting_requests enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products for select
  using (active = true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Visitors can submit fitting requests" on public.fitting_requests;
create policy "Visitors can submit fitting requests"
  on public.fitting_requests for insert to anon, authenticated
  with check (
    length(trim(name)) between 2 and 120
    and length(trim(email)) between 5 and 254
    and length(trim(phone)) between 5 and 40
    and length(trim(occasion)) between 2 and 80
    and length(notes) <= 2000
  );

drop policy if exists "Admins can manage fitting requests" on public.fitting_requests;
create policy "Admins can manage fitting requests"
  on public.fitting_requests for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers can create their support conversation" on public.support_conversations;
create policy "Customers can create their support conversation"
  on public.support_conversations for insert to authenticated
  with check (customer_id = auth.uid() and (auth.jwt() ->> 'is_anonymous') = 'true');

drop policy if exists "Customers and admins can view support conversations" on public.support_conversations;
create policy "Customers and admins can view support conversations"
  on public.support_conversations for select to authenticated
  using (
    customer_id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "Admins can update support conversations" on public.support_conversations;
create policy "Admins can update support conversations"
  on public.support_conversations for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers can update their open conversation name" on public.support_conversations;
create policy "Customers can update their open conversation name"
  on public.support_conversations for update to authenticated
  using (customer_id = auth.uid() and status = 'open')
  with check (customer_id = auth.uid() and status = 'open');

drop policy if exists "Customers and admins can view support messages" on public.support_messages;
create policy "Customers and admins can view support messages"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and (
          c.customer_id = auth.uid()
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

drop policy if exists "Customers and admins can send support messages" on public.support_messages;
create policy "Customers and admins can send support messages"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (
        sender_role = 'customer'
        and (auth.jwt() ->> 'is_anonymous') = 'true'
        and exists (
          select 1 from public.support_conversations c
          where c.id = conversation_id and c.customer_id = auth.uid() and c.status = 'open'
        )
      )
      or (
        sender_role = 'admin'
        and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      )
    )
  );

drop policy if exists "Visitors can view business settings" on public.business_settings;
create policy "Visitors can view business settings"
  on public.business_settings for select to anon, authenticated
  using (key = 'whatsapp_number');

drop policy if exists "Admins can manage business settings" on public.business_settings;
create policy "Admins can manage business settings"
  on public.business_settings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fitting_requests'
  ) then
    alter publication supabase_realtime add table public.fitting_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_conversations'
  ) then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'business_settings'
  ) then
    alter publication supabase_realtime add table public.business_settings;
  end if;
end
$$;
