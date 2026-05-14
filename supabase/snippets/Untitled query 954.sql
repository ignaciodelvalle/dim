select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname = 'on_auth_user_created';