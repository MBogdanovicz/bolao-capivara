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
  tests/                 testes do banco num Postgres comum
.github/workflows/ci.yml lint, build e testes do banco
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

1. **Supabase:** crie o projeto e rode o conteúdo de
   `supabase/migrations/20261007000000_esquema_inicial.sql` no SQL Editor.
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
