import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/', 'node_modules/'],
  },
  ...tseslint.configs['flat/strict-type-checked'],
  ...tseslint.configs['flat/stylistic-type-checked'],
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts', '*.config.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...prettier.rules,
    },
  },
]
