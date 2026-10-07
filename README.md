# Bolão Capivara

PWA de bolão de futebol entre amigos. Funciona em Android e iOS pelo navegador
(instalada na tela inicial), com jogos e resultados atualizados sozinhos.

A definição completa do projeto (stack, modelo de dados, regras, telas e plano)
está no [documento de definição](https://claude.ai/code/artifact/01772291-b6e7-4603-bebe-3d4739c62941).

## Stack

| Peça | Serviço (plano grátis) |
| --- | --- |
| App | React + Vite + TypeScript, `vite-plugin-pwa` |
| Hospedagem | Cloudflare Pages, em `bolao.capivaraec.com` |
| Banco, login e servidor | Supabase (Postgres, Auth, `pg_cron`, Edge Functions) |
| Jogos e resultados | football-data.org |

## Estrutura

```
src/                     app React
  auth/                  sessão e proteção de rotas
  pages/                 telas
  lib/supabase.ts        cliente do Supabase
supabase/
  migrations/            esquema do banco (tabelas, RLS, pontos, ranking)
  functions/sync-matches Edge Function que busca jogos na football-data.org
  setup/                 SQL de configuração única (agendamento)
  tests/                 testes do banco num Postgres comum
.github/workflows/       CI, publicação da Edge Function e keep-alive
```

## Rodar o app

```bash
cp .env.example .env.local   # preencha com a URL e a chave anon do Supabase
npm install
npm run dev
```

## Testar o banco

Os testes aplicam as migrations num Postgres vazio, simulando o que o Supabase
traz pronto, e conferem pontuação, segurança e ranking. O CI roda isso em todo PR.

```bash
DATABASE_URL=postgres://usuario:senha@localhost:5432/banco supabase/tests/run.sh
```

## Configuração dos serviços (uma vez)

1. **Supabase:** crie o projeto e rode, em ordem, o conteúdo de cada arquivo
   de `supabase/migrations/` no SQL Editor. Quando um PR novo trouxer outra
   migration, rode só a nova.
2. **Login por código:** em Authentication > Emails, edite o modelo *Magic Link*
   para mostrar o código `{{ .Token }}` em vez do link. Em Authentication >
   URL Configuration, use `https://bolao.capivaraec.com` como Site URL.
3. **Login com Google:** crie um OAuth Client no Google Cloud (grátis) e
   ative o provedor Google no Supabase, em Authentication > Providers.
4. **Cloudflare Pages:** conecte este repositório, com comando de build
   `npm run build`, pasta `dist` e as variáveis `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
5. **Domínio:** no GoDaddy, crie um registro CNAME `bolao` apontando para o
   endereço `*.pages.dev` do projeto, e adicione o domínio em Custom domains
   no Cloudflare Pages.

## Sincronização de jogos

A Edge Function `sync-matches` busca os jogos do Brasileirão na football-data.org
e grava no banco. O `pg_cron` a chama a cada 10 minutos, mas ela só consulta a
API quando há jogo em andamento ou quando a última sincronização tem mais de 6
horas. Quando um jogo encerra, o banco calcula os pontos sozinho.

Nenhuma chave vai no código nem no chat. Cada uma fica guardada no serviço que a usa:

| Onde | Nome | Valor |
| --- | --- | --- |
| Supabase > Edge Functions > Secrets | `FOOTBALL_DATA_API_KEY` | Chave recebida por e-mail da football-data.org |
| Supabase > Edge Functions > Secrets | `CRON_SECRET` | Um texto longo e aleatório inventado por você |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_ACCESS_TOKEN` | Token criado em supabase.com/dashboard/account/tokens |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_PROJECT_REF` | O código do projeto, que aparece na URL do Supabase |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_URL` e `SUPABASE_ANON_KEY` | Os mesmos do `.env.local` (usados pelo keep-alive) |

Depois de cadastrar os segredos:

1. No GitHub, em Actions > Publicar Edge Functions, clique em **Run workflow**
   para publicar a função (depois disso ela é republicada sozinha a cada merge).
2. No SQL Editor do Supabase, rode `supabase/setup/agendamento.sql`, trocando
   a URL do projeto e o `CRON_SECRET` pelos valores reais.
3. Em até 10 minutos, a tabela `matches` estará preenchida com os jogos do
   Brasileirão. Os registros de execução ficam em Edge Functions > sync-matches > Logs.
