import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/', 'node_modules/', '*.config.*'],
  },
  ...tseslint.configs['flat/strict-type-checked'],
  ...tseslint.configs['flat/stylistic-type-checked'],
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
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
