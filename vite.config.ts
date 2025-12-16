import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const base = repo ? `/${repo}/` : '/'

  return {
    base,
    plugins: [react()],
  }
})
