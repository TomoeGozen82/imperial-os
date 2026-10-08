import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Shared flat ESLint config for TypeScript Node packages and the backend. */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
);
