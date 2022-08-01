module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
    'plugin:import/typescript',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],
    semi: ['error', 'never'],
    'import/prefer-default-export': 0,
    'lines-between-class-members': 0,
    'no-await-in-loop': 0,
    'no-useless-constructor': 0,
    'no-unused-vars': 'warn',
    'no-empty-function': 0,
    'no-continue': 0,
    'max-len': ['error', { code: 100 }],
    'no-underscore-dangle': 0,
    'import/no-unresolved': 0,
  },
}
