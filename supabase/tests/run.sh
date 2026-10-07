#!/usr/bin/env bash
# Applies the migrations to an empty Postgres database and runs the tests.
# Usage: DATABASE_URL=postgres://... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql() { command psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql -f 00_supabase_stub.sql
for f in ../migrations/*.sql; do psql -f "$f"; done
psql -f 01_default_grants.sql
psql -o /dev/null -f 10_tests.sql
echo "All tests passed."
