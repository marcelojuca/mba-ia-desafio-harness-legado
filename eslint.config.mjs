// G2: lint de api/ e web/. Rode pelos gates: `npm run gates` (ou `npm run gates -- G2`).
// Não adicione `ignores` para pastas de api/src ou web/src: arquivo fora do lint é violação escondida.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'kit-gates/**', 'blackbox/**', 'scripts/**', '.harness/**', '*.config.*js'],
  },
  {
    files: ['api/**/*.{ts,mts,cts}', 'web/**/*.{ts,tsx,mts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    linterOptions: {
      // Comentário de supressão não vale: qualquer eslint-disable vira erro.
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'all' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      'no-console': 'off',
    },
  },
  {
    files: ['api/**/*.{ts,mts,cts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['web/**/*.{ts,tsx,mts}'],
    languageOptions: { globals: { ...globals.browser } },
  },
)
