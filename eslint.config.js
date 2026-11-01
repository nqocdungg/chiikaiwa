import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    'coverage/**',
    '.data/**',
    '.cache/**',
    '.vercel/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: [
      '*.js',
      'api/**/*.js',
      'server/**/*.js',
      'scripts/**/*.js',
      'tests/**/*.js',
      'tests/**/*.jsx',
      'client/vite.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/server/**',
                '**/api/**',
                '@chiikaiwa/server',
                'node:*',
              ],
              message: 'Server code must not be imported into the browser.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]);
