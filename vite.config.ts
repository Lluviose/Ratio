import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { reactCompilerBabelConfig } from './react-compiler.shared'

// buildId 必须对同一份源码可复现：此前本地构建用时间戳，零改动重新 build 也会
// 改变 define 注入值 → 入口内容变 → 全部 hash 变（视觉回归/产物 diff 全部失真）。
// CI 用 GITHUB_SHA；本地用 git 短 SHA（工作区脏时加 -dirty）；无 git 时退 'dev'。
function resolveBuildId(): string {
  const ciSha = process.env.GITHUB_SHA?.slice(0, 7)
  if (ciSha) return ciSha
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0
    return dirty ? `${sha}-dirty` : sha
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
  const isUserOrOrgPagesRepo = Boolean(owner && repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`)
  const base = repo && !isUserOrOrgPagesRepo ? `/${repo}/` : '/'
  const buildId = resolveBuildId()
  // 懒加载边界上的全部 chunk：六个显式分组，加上只被懒屏幕共享的依赖 chunk
  // （TrendScreen/StatsScreen/SettingsScreen/AiAssistant/savingsGoal，由 rolldown
  // 按共享模块自动拆出）。三处消费必须同一份名单：modulePreload 过滤、SW
  // precache 排除（globIgnores）、SW 运行时 CacheFirst——否则会出现「预缓存里
  // 随每次发版重新下载」或「被排除又没有运行时缓存导致离线不可用」的口径分裂。
  const lazyChunkNames = [
    'ai-assistant',
    'screen-trend',
    'screen-stats',
    'screen-settings',
    'vendor-markdown',
    'vendor-matter',
    'AiAssistant',
    'TrendScreen',
    'StatsScreen',
    'SettingsScreen',
    'savingsGoal',
  ]
  const lazyChunkAlternation = lazyChunkNames.join('|')
  const lazyChunkFilePattern = new RegExp(`(?:^|/)(?:${lazyChunkAlternation})-[^/]*\\.js$`, 'i')
  const lazyChunkPattern = new RegExp(`/assets/(?:${lazyChunkAlternation})-[^/]*\\.js$`, 'i')

  return {
    base,
    define: {
      __APP_BUILD__: JSON.stringify(buildId),
    },
    build: {
      // Gzip budgets and lazy-boundary checks are enforced by scripts/check-bundle-budget.mjs.
      // The eager entry is intentionally just over Rolldown's generic 500 kB raw warning.
      chunkSizeWarningLimit: 550,
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter((dep) => !lazyChunkFilePattern.test(dep))
        },
      },
      rollupOptions: {
        output: {
          // rolldown 会把函数式 manualChunks 转成 includeDependenciesRecursively: true 的
          // advancedChunks——被匹配模块的依赖树整体并入该组，vendor 组永远抢不到 recharts/markdown
          // （它们已随屏幕组被吞），分包名义存在实际为空。这里显式声明并关掉递归吸附，
          // 恢复「只有被 test 命中的模块进组」的旧 manualChunks 语义。
          advancedChunks: {
            // Rolldown defaults this to true, which recursively pulls each matched screen's
            // dependencies into that group. Shared modules can then be owned by a lazy group,
            // forcing the entry chunk to statically import the very chunks we meant to defer.
            // Keep matching exact: vendor groups claim vendor modules, screen groups claim only
            // their screen modules, and the normal chunk graph preserves the lazy boundaries.
            includeDependenciesRecursively: false,
            groups: [
              { name: 'vendor-matter', test: /[\\/]node_modules[\\/]matter-js[\\/]/, priority: 10 },
              {
                name: 'vendor-markdown',
                test: /[\\/]node_modules[\\/](?:react-markdown[\\/]|remark-gfm[\\/]|micromark|mdast-util|unist-util|hast-util|property-information[\\/]|space-separated-tokens[\\/]|comma-separated-tokens[\\/])/,
                priority: 10,
              },
              { name: 'ai-assistant', test: /[\\/]src[\\/]components[\\/]AiAssistant\.tsx/, priority: 1 },
              { name: 'screen-trend', test: /[\\/]src[\\/]screens[\\/]TrendScreen\.tsx/, priority: 1 },
              { name: 'screen-stats', test: /[\\/]src[\\/]screens[\\/](?:StatsScreen\.tsx|stats[\\/])/, priority: 1 },
              { name: 'screen-settings', test: /[\\/]src[\\/]screens[\\/](?:SettingsScreen\.tsx|settings[\\/])/, priority: 1 },
            ],
          },
        },
      },
    },
    plugins: [
      react({
        // React Compiler：仅编译懒加载屏幕树，范围与理由见 react-compiler.shared.ts
        babel: reactCompilerBabelConfig,
      }),
      VitePWA({
        // prompt 模式：新版本先 waiting，由 src/pwa.ts 弹 toast 征得用户同意后再接管，
        // 避免部署新版时把正在输入的用户整页强刷（skipWaiting 必须保持 false）
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [
          'pwa.svg',
          'apple-touch-icon.png',
          'manifest.webmanifest',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-192x192.png',
          'pwa-maskable-512x512.png',
        ],
        workbox: {
          navigateFallback: 'index.html',
          skipWaiting: false,
          clientsClaim: true,
          globIgnores: lazyChunkNames.map((name) => `**/${name}-*.js`),
          runtimeCaching: [
            {
              urlPattern: lazyChunkPattern,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ratio-lazy-chunks-v1',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  // 懒边界 chunk 现有 11 个，新旧版本交替期并存也不至于挤掉在用项
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
        manifest: false,
      }),
    ],
  }
})
