-- DietPal: per-IP limit on new push subscriptions (used by Edge Function push v3+).
-- Apply BEFORE deploying the new push function. Safe for the current function (nullable column).
alter table public.push_subs add column if not exists ip_hash text;
create index if not exists push_subs_ip_created_idx on public.push_subs (ip_hash, created_at);
