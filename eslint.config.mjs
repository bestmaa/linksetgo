import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    files: ['src/**/*.tsx', 'src/features/**/*.ts'],
    rules: {
      'max-lines': [
        'error',
        {
          max: 250,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  {
    files: ['src/migrations/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: [
      'src/features/**/view/**/*.tsx',
      'src/features/**/*.view.tsx',
      'src/features/**/*View.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features/**/hooks/**',
                '@/features/**/api/**',
                '@/lib/client/**',
                'next/navigation',
                'payload',
                '@payloadcms/**',
              ],
              message: 'Views are props-only. Put state and integrations in a hook and connector.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['.next/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default eslintConfig
