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
        includeAssets: ['pwa.svg'],
        manifest: {
          name: 'ratio',
          short_name: 'ratio',
          description: 'ratio',
          theme_color: '#4f46e5',
          background_color: '#f2f4f7',
          display: 'standalone',
          scope: base,
          start_url: base,
          icons: [
            {
              src: 'pwa.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
      }),
    ],
  }
})
