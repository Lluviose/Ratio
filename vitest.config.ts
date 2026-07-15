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
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/server/**'],
    globals: true,
    // Windows 开发机高负载时，默认 fork 数会出现 worker 启动超时/冻结。
    // 两个 worker 在本地与 CI 都更稳定，代价仅是全量测试稍慢。
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
  },
})
