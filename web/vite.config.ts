import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A porta vem de WEB_PORT em web/.env.local, gravado pelo `npm run up` para esta cópia.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT) || 5173,
      strictPort: true,
    },
  }
})
