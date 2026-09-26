// Regenerates supabase/apply_all.sql from supabase/migrations/*.sql (in filename order), wrapped in one transaction.
// Usage: node supabase/build-apply-all.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
const bar = '-- ' + '>'.repeat(77)

const header = `-- =============================================================================
-- Erasmus Help — Chat: ALL migrations in one file (GENERATED — do not edit by hand)
--
-- Supabase Dashboard → SQL Editor: paste everything, Run once. Works on a fresh project and on one
-- that already ran an older apply_all.sql (every migration is idempotent).
-- Runs as \`postgres\` in a single transaction: either everything is applied or nothing.
-- Source of truth: supabase/migrations/*.sql (same content, same order):
${files.map((f) => `--   ${f}`).join('\n')}
-- Regenerate after editing a migration: node supabase/build-apply-all.mjs
-- If you later adopt the CLI (\`supabase db push\`) on a project where this file was run,
-- mark the migrations as applied first: \`supabase migration repair --status applied <version>\`.
-- =============================================================================

begin;
`

const body = files
  .map((f) => `\n\n${bar}\n-- >>> migrations/${f}\n${bar}\n\n${readFileSync(join(dir, 'migrations', f), 'utf8').trimEnd()}\n`)
  .join('')

writeFileSync(join(dir, 'apply_all.sql'), `${header}${body}\ncommit;\n\nselect 'Erasmus Help chat schema applied' as status;\n`)
console.log(`apply_all.sql rebuilt from ${files.length} migrations`)
