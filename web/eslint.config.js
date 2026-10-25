import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    // Solo il plugin, senza il preset recommended: ci serve una sola regola.
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Codice legacy portato così com'è: i `any` spariscono con il porting delle fasi 4-5.
      // Da riportare a 'error' al termine della fase 5 (vedi docs/decisioni.md).
      '@typescript-eslint/no-explicit-any': 'warn',
      // Vietato dangerouslySetInnerHTML (XSS): piano, Fase 4 punto 10.
      'react/no-danger': 'error',
    },
  },
])
