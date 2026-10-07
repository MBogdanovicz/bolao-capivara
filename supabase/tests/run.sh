#!/usr/bin/env bash
# Aplica as migrations num Postgres vazio e roda os testes.
# Uso: DATABASE_URL=postgres://... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql -f 00_simula_supabase.sql
for f in ../migrations/*.sql; do psql -f "$f"; done
psql -f 01_permissoes_padrao.sql
psql -o /dev/null -f 10_testes.sql
echo "Todos os testes passaram."
