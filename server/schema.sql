-- myshowroom by Peverelli Design — schema PostgreSQL (idempotente)

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin','manager','consultant')),
  site text not null default 'Como Città',
  active boolean not null default true,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,                 -- sha256 del token (il token in chiaro non è mai salvato)
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists products (
  id text primary key,
  brand text not null,
  name text not null,
  category text not null,
  location text not null,
  zone text not null default '',
  status text not null,
  price double precision not null default 0,
  currency text not null check (currency in ('CHF','EUR')),
  dims text not null default 'Da verificare',
  description text not null default '',
  images jsonb not null default '[]',
  materials jsonb not null default '[]',
  colors jsonb not null default '[]',
  configs jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_location_idx on products(location);

create table if not exists files (
  id text primary key,
  storage_key text not null unique,
  file_name text not null,
  mime text not null,
  size integer not null,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key,
  name text not null,
  type text not null,
  language text not null,
  file_id text references files(id) on delete set null,
  external_url text,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists document_products (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  unique (document_id, product_id)
);
create index if not exists document_products_product_idx on document_products(product_id);

create table if not exists clients (
  id text primary key,
  name text not null,
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  owner_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clients add column if not exists company text not null default '';
alter table clients add column if not exists role text not null default '';
alter table clients add column if not exists mobile text not null default '';
alter table clients add column if not exists website text not null default '';
alter table clients add column if not exists address text not null default '';
alter table clients add column if not exists site text not null default '';
alter table clients add column if not exists source text not null default 'manuale';
alter table clients add column if not exists card_file_id text references files(id) on delete set null;
alter table clients add column if not exists privacy_signed_at timestamptz;
alter table clients add column if not exists privacy_version text;
alter table clients add column if not exists marketing_consent boolean;
alter table clients add column if not exists consent_file_id text references files(id) on delete set null;
alter table clients add column if not exists consent_by text references users(id) on delete set null;

-- impostazioni modificabili dall'amministratore (es. testo dell'informativa privacy)
create table if not exists settings (
  id text primary key,
  value text not null,
  updated_by text references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id text primary key,
  number text unique,
  client_id text references clients(id) on delete set null,
  status text not null check (status in ('draft','sent')),
  currency text not null default 'CHF',
  rate double precision not null default 0.93,
  show_prices boolean not null default true,
  subject text not null default '',
  body text not null default '',
  total double precision not null default 0,
  pdf_file_id text references files(id) on delete set null,
  created_by text not null references users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists quotes_owner_idx on quotes(created_by, status);

create table if not exists quote_items (
  id text primary key,
  quote_id text not null references quotes(id) on delete cascade,
  product_id text not null,            -- nessuna FK: la riga conserva lo snapshot anche se il prodotto viene eliminato
  brand text not null,
  product_name text not null,
  config text not null,
  dims text not null,
  material text not null,
  color text not null,
  price double precision not null,
  currency text not null,
  position integer not null default 0
);
create index if not exists quote_items_quote_idx on quote_items(quote_id);

create table if not exists appointments (
  id text primary key,
  client text not null,
  email text not null default '',
  client_id text references clients(id) on delete set null,
  site text not null,
  type text not null,
  date text not null,
  time text not null,
  duration text not null,
  notes text not null default '',
  consultant_id text references users(id) on delete set null,
  source text not null default 'interno',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site, date, time)
);

create table if not exists tasks (
  id text primary key,
  name text not null,
  done boolean not null default false,
  assignee_id text references users(id) on delete set null,
  due_date text,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id text primary key,
  product_id text not null unique references products(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  client text not null,
  user_id text not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists emails (
  id text primary key,
  "to" text not null,
  subject text not null,
  body text not null,
  attachments jsonb not null default '[]',
  status text not null,
  error text,
  message_id text,
  quote_id text references quotes(id) on delete set null,
  appointment_id text references appointments(id) on delete set null,
  sent_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists emails_quote_idx on emails(quote_id);

-- ── Sicurezza su Supabase ─────────────────────────────────────────────
-- Row Level Security attiva su tutte le tabelle e nessuna policy: le chiavi pubbliche (anon)
-- non leggono né scrivono nulla. L'app usa la chiave segreta (service_role), che bypassa RLS;
-- il proprietario delle tabelle (connessione diretta) non è soggetto a RLS.
do $$
declare t text;
begin
  foreach t in array array['users','sessions','products','files','documents','document_products','clients','quotes','quote_items','appointments','tasks','reservations','emails','settings'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table %I from authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on table %I to service_role', t);
    end if;
  end loop;
end $$;
