import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
  const isUserOrOrgPagesRepo = Boolean(owner && repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`)
  const base = repo && !isUserOrOrgPagesRepo ? `/${repo}/` : '/'

  return {
    base,
    plugins: [react()],
  }
})
