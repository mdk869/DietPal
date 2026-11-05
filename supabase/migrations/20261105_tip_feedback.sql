-- Tips hari ini (v1.8): 👍/👎 per tip, written only by the Edge Function `push` (action "tipfb").
-- Anonymous: phone ID and IP are stored as salted SHA-256 hashes; no name, diet data or raw IP.
create table if not exists public.tip_feedback (
  device_hash text not null,
  tip_id      text not null check (tip_id ~ '^[a-z0-9-]{1,40}$'),
  vote        smallint not null check (vote in (-1, 1)),
  why         text check (why is null or why ~ '^[a-zA-Z]{1,12}$'),   -- why the app showed it ('lowProtein', 'season'…), null = browsed
  ip_hash     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (device_hash, tip_id)
);
create index if not exists tip_feedback_ip_updated_idx on public.tip_feedback (ip_hash, updated_at);

-- RLS on with no policies: only the service role (the Edge Function) can read or write.
alter table public.tip_feedback enable row level security;
revoke all on public.tip_feedback from anon, authenticated;

-- For you, in the SQL Editor: select * from tip_feedback_summary;
create or replace view public.tip_feedback_summary with (security_invoker = true) as
select tip_id,
       count(*) filter (where vote = 1)  as membantu,
       count(*) filter (where vote = -1) as tak_membantu,
       count(*)                          as jumlah,
       round(100.0 * count(*) filter (where vote = 1) / count(*)) as peratus_membantu,
       max(updated_at)                   as terakhir
from public.tip_feedback
group by tip_id
order by jumlah desc, tip_id;
revoke all on public.tip_feedback_summary from anon, authenticated;
