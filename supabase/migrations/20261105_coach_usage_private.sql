-- DietPal: make coach_usage_add server-only.
-- Apply ONLY AFTER Vercel has SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys → Secret key)
-- and a redeploy, otherwise Coach AI pauses (503 quota_unavailable) until the key is set.
revoke execute on function public.coach_usage_add(text, text[], integer, integer) from anon;
grant execute on function public.coach_usage_add(text, text[], integer, integer) to service_role;
