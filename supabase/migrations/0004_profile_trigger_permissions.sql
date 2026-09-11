-- The signup trigger runs internally; browser clients do not call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
