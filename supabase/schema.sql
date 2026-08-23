-- 羽球隊長台 · 共用（多人共管、免登入）資料表
-- 模型：一個社團、一份公開共用的資料，拿到網址的人都能看、都能改（無帳號）。
-- 存取：完全開放 —— anon（匿名）即可讀寫。這代表沒有任何門檻，網址外流就有人能改。
--       日後要加防線很容易（見檔尾）。
-- 用法：在 Supabase 專案的 SQL Editor 貼上整段執行一次即可（可重複執行）。

create extension if not exists "pgcrypto";

-- 1) 社團設定（單列，用 id=1 鎖成只有一列）
create table if not exists public.settings (
  id            smallint primary key default 1 check (id = 1),
  play_weekday  smallint not null default 5,                              -- 0=日 … 6=六
  hourly_rate   integer  not null default 500,
  default_court text     not null default '5',
  default_slots text[]   not null default array['19:00','20:00','21:00'], -- 預設時段 "HH:MM"
  tpl_open      text     not null default '',                             -- 空 = 前端套用預設模板
  tpl_fee       text     not null default '',
  updated_at    timestamptz not null default now()
);

-- 2) 成員（id 由前端產生）
create table if not exists public.members (
  id         text primary key,
  name       text not null,
  level      text not null default 'floating' check (level in ('fixed','floating')),
  created_at timestamptz not null default now()
);

-- 3) 場次（每天一列；用日期當主鍵。play=打球 / rest=休息）
create table if not exists public.sessions (
  date       date primary key,
  status     text not null default 'play' check (status in ('play','rest')),
  created_at timestamptz not null default now()
);

-- 4) 時段（場次底下的每個 1 小時時段；id 由前端產生）
create table if not exists public.session_slots (
  id           text primary key,
  session_date date not null references public.sessions(date) on delete cascade,
  start_time   text not null,                        -- "HH:MM"
  courts       text[] not null default '{}'          -- 這時段借的場地號碼，可多面
);
create index if not exists idx_session_slots_date on public.session_slots(session_date);

-- 5) 出席 & 收款（成員 × 場次）
--    只存「非預設」狀態：預設是「出席、全部時段、未收款」，沒有列 = 預設。
create table if not exists public.attendance (
  session_date date not null references public.sessions(date) on delete cascade,
  member_id    text not null references public.members(id)     on delete cascade,
  status       text not null default 'in' check (status in ('in','leave')),
  slots        text[] not null default '{}',         -- 出席時參加哪些時段（對應 session_slots.id）
  paid         boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (session_date, member_id)
);
create index if not exists idx_attendance_date on public.attendance(session_date);

-- ---------- Row Level Security：完全開放（anon 可讀寫）----------
alter table public.settings      enable row level security;
alter table public.members       enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_slots enable row level security;
alter table public.attendance    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','members','sessions','session_slots','attendance']
  loop
    execute format('drop policy if exists "public all" on public.%I;', t);
    execute format(
      'create policy "public all" on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ---------- 即時同步：把表加入 realtime 發布（大家畫面同步更新）----------
do $$
begin
  begin
    alter publication supabase_realtime add table
      public.settings, public.members, public.sessions, public.session_slots, public.attendance;
  exception when duplicate_object then null;   -- 已加過就略過
  end;
end $$;

-- ---------- 初始一列社團設定 ----------
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- 日後要加「防線」的兩個常見做法（前端配合改一點）：
--   A. 共用通關密碼：編輯前要輸入一組密碼（前端擋、或用 Postgres function 驗）。
--   B. 改回需要登入：把上面政策的 anon 拿掉、改成 authenticated，並加回登入畫面。
-- ============================================================
