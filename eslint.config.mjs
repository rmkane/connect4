import path from 'node:path'
import { fileURLToPath } from 'node:url'

import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'pnpm-lock.yaml'],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', './**', '../*', '../**'],
              message: 'Use the @/ path alias instead of relative imports.',
            },
          ],
        },
      ],
    },
  }
)
