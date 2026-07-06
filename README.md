# Portal de estudos da Marina

Vite + React. Sincroniza entre dispositivos via **Supabase** (Postgres gerenciado,
plano grátis). Sem servidor próprio para manter. Se as variáveis do Supabase não
estiverem configuradas, o app continua funcionando só com `localStorage` (um
dispositivo), então dá pra rodar e testar antes de configurar tudo.

---

## Deploy completo (~10 min)

### 1. Criar o projeto Supabase
1. Entre em https://supabase.com -> **New project** (guarde a senha do banco).
2. Quando o projeto subir, abra **SQL Editor -> New query**, cole o conteúdo de
   `supabase-setup.sql` e clique em **Run**. Isso cria a tabela `study_state`.
3. Vá em **Project Settings -> API** e copie dois valores:
   - **Project URL** -> vira `VITE_SUPABASE_URL`
   - **anon public** key -> vira `VITE_SUPABASE_ANON_KEY`

### 2. Deploy na Vercel
```bash
npm install
npx vercel            # login + aceitar os defaults (Vite é detectado sozinho)
```
Depois configure as variáveis (uma vez):
- **Vercel -> seu projeto -> Settings -> Environment Variables**, adicione
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores do passo 1.
- Como o Vite injeta as variáveis no build, rode o deploy de produção **depois**
  de salvá-las:
```bash
npx vercel --prod
```

Pronto -- mande a URL `.vercel.app` para a Marina. Ela pode abrir no notebook e no
celular; o progresso sincroniza sozinho.

> Dica: se ligar o repositório ao GitHub em vercel.com/new, cada `git push`
> redeploya automático (e as env vars já ficam guardadas).

---

## Rodar localmente
```bash
cp .env.example .env      # preencha com URL e anon key
npm install
npm run dev
```

---

## Como a sincronização funciona
- Todo o estado (módulos, conteúdos, aulas, durações, prazo) é salvo como **uma
  linha JSON** na tabela `study_state`.
- Salvamento é automático e com debounce; o rodapé mostra o status
  (Sincronizando... / Sincronizado / Sem conexão).
- Ao voltar o foco para a aba, o app **re-busca** o estado do servidor -- então
  marcar uma aula no celular aparece no notebook ao voltar pra ele.
- `localStorage` funciona como cache offline: sem internet, salva local e
  sincroniza quando a conexão volta.
- Modelo de conflito: **última escrita vence**. Para uso de uma pessoa em
  dispositivos alternados, é o comportamento esperado.

## Nota de segurança
Não há login: a `anon key` é pública (fica no bundle, por design) e a política do
banco libera leitura/escrita nessa tabela. Para um controle de aulas isso é baixo
risco. Se quiser proteção de verdade depois, o caminho natural é o **Supabase Auth**
(magic link por e-mail) + ajustar a policy para o usuário dono da linha -- dá pra
adicionar sem mexer no resto do app.
