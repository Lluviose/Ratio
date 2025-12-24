import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
  const isUserOrOrgPagesRepo = Boolean(owner && repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`)
  const base = repo && !isUserOrOrgPagesRepo ? `/${repo}/` : '/'

  return {
    base,
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
          runtimeCaching: [
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
