import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const supabaseFenceMessage = 'Supabase is only allowed in src/data — see spec §9.'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.superpowers', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      // The import fence: UI code must go through src/data, never Supabase directly.
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@supabase/supabase-js', message: supabaseFenceMessage }],
          patterns: [{ group: ['**/lib/supabase'], message: supabaseFenceMessage }],
        },
      ],
    },
  },
  {
    // The only places allowed past the fence.
    files: ['src/lib/**', 'src/data/**', 'tests/integration/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
)
