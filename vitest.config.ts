import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { reactCompilerBabelConfig } from './react-compiler.shared'

export default defineConfig({
  // 与 vite.config.ts 保持一致：单测跑的是经 React Compiler 转换后的代码
  plugins: [
    react({
      babel: reactCompilerBabelConfig,
    }),
  ],
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
