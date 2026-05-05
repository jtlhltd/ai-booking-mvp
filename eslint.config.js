// ESLint flat config (ESM).
//
// Intentionally permissive baseline so the rule set can be ratcheted upward
// over time without dumping a wall of pre-existing violations on every PR.
// Fail-on-error in CI is wired via `npm run lint`; warnings are informational.

import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'coverage-tmp/**',
      'data/**',
      'demos/**',
      'public/**',
      'docs/**',
      'tests/manual/**',
      'tests/fixtures/**',
      'archive/**',
      '.cursor/**',
      '*.min.js'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
        ...globals.jest
      }
    },
    rules: {
      // Errors (block CI) — actual bugs that would cause runtime issues.
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-cond-assign': 'error',
      'no-func-assign': 'error',
      'no-self-assign': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',

      // Warnings (informational; ratcheted later).
      'no-unused-vars': 'off',
      'no-undef': 'warn', // a handful of pre-existing hits in server.js + scripts
      'no-empty': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn', // mostly cosmetic regex escapes
      'no-async-promise-executor': 'warn',
      'no-constant-condition': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'warn',
      'no-fallthrough': 'warn',
      'no-case-declarations': 'off',
      'no-empty-pattern': 'warn',
      'no-extra-boolean-cast': 'warn',

      // Style hint (Prettier handles formatting).
      'prefer-const': 'warn',
      eqeqeq: 'off'
    }
  },
  // Test files: be even looser
  {
    files: ['tests/**/*.js', 'tests/**/*.mjs'],
    rules: {
      'no-empty': 'off',
      'no-unused-vars': 'off'
    }
  },
  // CommonJS-style files in lib/ (orphan dead code; see PR-5 commit message)
  {
    files: ['lib/leads.js', 'lib/vapi.js', 'lib/workflow.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs
      }
    }
  },
  // Disable stylistic rules that conflict with Prettier
  prettierConfig
];
