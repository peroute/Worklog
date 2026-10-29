// Writes .env.test and .env.local from the running LOCAL Supabase stack.
// Usage: npm run env:local   (requires `npx supabase start` first)
// Both files are gitignored; local keys are throwaway dev keys, never production ones.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

let output
try {
  output = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch (error) {
  console.error('Could not read local Supabase status. Is it running? Try: npx supabase start')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const vars = Object.fromEntries(
  output
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
  if (!vars[key]) {
    console.error(`Missing ${key} in supabase status output`)
    process.exit(1)
  }
}

const browserVars = `VITE_SUPABASE_URL=${vars.API_URL}\nVITE_SUPABASE_ANON_KEY=${vars.ANON_KEY}\n`
writeFileSync('.env.local', browserVars)
// The service role key bypasses RLS: only the integration-test setup uses it, never the app.
writeFileSync('.env.test', `${browserVars}SUPABASE_SERVICE_ROLE_KEY=${vars.SERVICE_ROLE_KEY}\n`)
console.log('Wrote .env.local and .env.test for', vars.API_URL)
