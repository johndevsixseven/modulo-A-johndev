import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // server.fs.deny substitui a lista padrão do Vite 8, por isso ela é repetida nas 6 primeiras linhas.
      // Padrões com "/" são comparados ao caminho absoluto, daí o "**/".
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/scripts/test-users.local.json', '**/supabase/functions/.env',
      ],
    },
  },
})
