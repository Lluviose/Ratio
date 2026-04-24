import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
  const isUserOrOrgPagesRepo = Boolean(owner && repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`)
  const base = repo && !isUserOrOrgPagesRepo ? `/${repo}/` : '/'
  const lazyChunkFilePattern = /(?:^|\/)(?:ai-assistant|screen-trend|screen-stats|screen-settings|vendor-charts|vendor-markdown)-.*\.js$/i
  const lazyChunkPattern = /\/assets\/(?:ai-assistant|screen-trend|screen-stats|screen-settings|vendor-charts|vendor-markdown)-.*\.js$/i

  return {
    base,
    build: {
      modulePreload: {
        resolveDependencies(_filename, deps) {
          return deps.filter((dep) => !lazyChunkFilePattern.test(dep))
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/')

            if (normalized.includes('/src/components/AiAssistant.tsx')) return 'ai-assistant'
            if (normalized.includes('/src/screens/TrendScreen.tsx')) return 'screen-trend'
            if (normalized.includes('/src/screens/StatsScreen.tsx')) return 'screen-stats'
            if (normalized.includes('/src/screens/SettingsScreen.tsx')) return 'screen-settings'

            if (normalized.includes('/node_modules/recharts/')) return 'vendor-charts'
            if (
              normalized.includes('/node_modules/react-markdown/') ||
              normalized.includes('/node_modules/remark-gfm/') ||
              normalized.includes('/node_modules/micromark') ||
              normalized.includes('/node_modules/mdast-util') ||
              normalized.includes('/node_modules/unist-util') ||
              normalized.includes('/node_modules/hast-util') ||
              normalized.includes('/node_modules/property-information/') ||
              normalized.includes('/node_modules/space-separated-tokens/') ||
              normalized.includes('/node_modules/comma-separated-tokens/')
            ) {
              return 'vendor-markdown'
            }
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
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
          skipWaiting: true,
          clientsClaim: true,
          globIgnores: [
            '**/ai-assistant-*.js',
            '**/screen-trend-*.js',
            '**/screen-stats-*.js',
            '**/screen-settings-*.js',
            '**/vendor-charts-*.js',
            '**/vendor-markdown-*.js',
          ],
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
                  maxEntries: 24,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/css2/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/s\//i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
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
