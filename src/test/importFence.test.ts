// @vitest-environment node
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The "import fence": Supabase may only be imported inside src/lib and src/data.
// Keeping every backend call in one folder is what makes a later migration
// (self-hosted Supabase or FastAPI) a rewrite of src/data only. See spec §9.
const supabaseImport = "import { supabase } from '../../lib/supabase'\nexport const x = supabase\n"

async function restrictedImportErrors(filePath: string): Promise<number> {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(supabaseImport, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').length
}

describe('supabase import fence', () => {
  it('eslint rejects supabase import in a feature file', async () => {
    expect(await restrictedImportErrors('src/features/x/y.tsx')).toBe(1)
  })

  it('eslint allows supabase import in the data layer', async () => {
    expect(await restrictedImportErrors('src/data/x.ts')).toBe(0)
  })
})
