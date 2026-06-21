/* eslint-env node */
// ESLint 8 旧式配置（flat config 需 ESLint 9+，本项目锁 8.57）。
// 覆盖 main / preload / renderer / shared / tests / scripts 全部 TS/TSX。
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    // prettier 放最后：关闭所有与 prettier 冲突的格式类规则
    'prettier'
  ],
  settings: {
    react: { version: 'detect' }
  },
  env: {
    node: true,
    browser: true,
    es2022: true
  },
  rules: {
    // 项目大量用 import type + 路径别名，关掉未使用表达式误报
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }
    ],
    // 允许不写 React 显式 import（react-jsx runtime）
    'react/react-in-jsx-scope': 'off',
    // 允许 any 但告警，避免一次性把存量代码全卡死；后续可收紧
    '@typescript-eslint/no-explicit-any': 'warn',
    // Electron 主进程有大量 process.env / __dirname 访问
    'no-undef': 'off'
  },
  ignorePatterns: [
    'node_modules/',
    'out/',
    'dist/',
    'release/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    '*.config.ts',
    '*.config.mjs',
    'scripts/' // 一次性工具脚本（rebuild/package/icon 生成），不纳入 lint
  ],
  overrides: [
    {
      // 测试文件放宽部分规则
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off'
      }
    }
  ]
}
