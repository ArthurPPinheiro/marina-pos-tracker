-- Cole isto em: Supabase → SQL Editor → New query → Run
-- Cria a tabela única onde vive todo o estado do portal.

create table if not exists study_state (
  id         text primary key,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security ligado, com acesso liberado para a chave anon.
-- (Ver nota de segurança no README: dado de baixo risco, sem login.)
alter table study_state enable row level security;

drop policy if exists "portal marina - acesso anon" on study_state;
create policy "portal marina - acesso anon"
  on study_state
  for all
  to anon
  using (true)
  with check (true);
