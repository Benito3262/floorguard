create table if not exists sltp_rules (
 id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
 owner text not null, chain_id int not null default 11155111, collection text not null, slug text, token_id text not null,
 kind text not null check (kind in ('tp','sl','trail')), trigger_price numeric, trail_pct numeric, high_water numeric,
 min_price_wei text not null, currency text not null, sell jsonb not null, sell_sig text not null,
 confirm_n int not null default 3, hits int not null default 0, status text not null default 'active',
 telegram_chat text, last_price numeric, last_source text, last_checked timestamptz, exec_tx text, note text, group_id uuid);
create table if not exists sltp_bids (
 id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
 buyer text not null, collection text not null, token_id text, any_token boolean not null, price_wei text not null,
 currency text not null, expiry bigint not null, bid jsonb not null, sig text not null, status text not null default 'open');
create table if not exists sltp_prices (collection text primary key, mock_floor numeric, updated timestamptz default now());
create table if not exists sltp_events (id bigserial primary key, at timestamptz default now(), rule_id uuid, kind text, detail text);
alter table sltp_rules enable row level security; alter table sltp_bids enable row level security;
alter table sltp_prices enable row level security; alter table sltp_events enable row level security;

create or replace function sltp_api(k text, op text, a jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
 if k is distinct from '<SLTP_DB_KEY>' then raise exception 'bad key'; end if;
 if op = 'rule_insert' then
   insert into sltp_rules select * from jsonb_populate_record(null::sltp_rules, a || jsonb_build_object('id', coalesce(a->>'id', gen_random_uuid()::text), 'created_at', now(), 'status','active','hits',0)) returning to_jsonb(sltp_rules.*) into r;
 elsif op = 'rule_update' then
   update sltp_rules t set trigger_price = coalesce((a->'p'->>'trigger_price')::numeric, t.trigger_price),
     high_water = coalesce((a->'p'->>'high_water')::numeric, t.high_water), hits = coalesce((a->'p'->>'hits')::int, t.hits),
     status = coalesce(a->'p'->>'status', t.status), last_price = coalesce((a->'p'->>'last_price')::numeric, t.last_price),
     last_source = coalesce(a->'p'->>'last_source', t.last_source), last_checked = coalesce((a->'p'->>'last_checked')::timestamptz, t.last_checked),
     exec_tx = coalesce(a->'p'->>'exec_tx', t.exec_tx), note = coalesce(a->'p'->>'note', t.note)
   where id = (a->>'id')::uuid returning to_jsonb(t.*) into r;
 elsif op = 'rule_transition' then
   update sltp_rules t set status = a->>'to' where id = (a->>'id')::uuid and status = a->>'from' returning to_jsonb(t.*) into r;
 elsif op = 'rules_list' then
   select coalesce(jsonb_agg(to_jsonb(t.*) order by created_at desc), '[]') into r from sltp_rules t
   where (a->>'owner' is null or lower(owner) = lower(a->>'owner')) and (a->>'status' is null or status = any(string_to_array(a->>'status', ',')));
 elsif op = 'bid_insert' then
   insert into sltp_bids select * from jsonb_populate_record(null::sltp_bids, a || jsonb_build_object('id', gen_random_uuid()::text, 'created_at', now(), 'status','open')) returning to_jsonb(sltp_bids.*) into r;
 elsif op = 'bids_list' then
   select coalesce(jsonb_agg(to_jsonb(t.*) order by (price_wei)::numeric desc), '[]') into r from sltp_bids t
   where status = 'open' and (a->>'collection' is null or lower(collection) = lower(a->>'collection'));
 elsif op = 'bid_status' then
   update sltp_bids t set status = a->>'status' where id = (a->>'id')::uuid returning to_jsonb(t.*) into r;
 elsif op = 'price_set' then
   insert into sltp_prices(collection, mock_floor, updated) values (lower(a->>'collection'), (a->>'floor')::numeric, now())
   on conflict (collection) do update set mock_floor = excluded.mock_floor, updated = now() returning to_jsonb(sltp_prices.*) into r;
 elsif op = 'price_get' then
   select to_jsonb(t.*) into r from sltp_prices t where collection = lower(a->>'collection');
 elsif op = 'event' then
   insert into sltp_events(rule_id, kind, detail) values ((a->>'rule_id')::uuid, a->>'kind', a->>'detail'); r := 'null';
 elsif op = 'events' then
   select coalesce(jsonb_agg(to_jsonb(t.*) order by id desc), '[]') into r from (select * from sltp_events where a->>'rule_id' is null or rule_id = (a->>'rule_id')::uuid order by id desc limit 100) t;
 else raise exception 'bad op %', op; end if;
 return r;
end $$;
revoke all on function sltp_api(text,text,jsonb) from public; grant execute on function sltp_api(text,text,jsonb) to anon, authenticated;
