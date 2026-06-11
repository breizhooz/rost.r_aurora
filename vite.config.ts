import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// HTTPS en dev : on sert le front en TLS dès que les certs mkcert existent
// (cf. ../backend/traefik/gen-certs.sh). Sans certs, on retombe sur http:// sans
// casser le démarrage.
const certDir = fileURLToPath(new URL('../backend/infra/traefik/certs', import.meta.url))
const certFile = `${certDir}/_wildcard.localhost.pem`
const keyFile = `${certDir}/_wildcard.localhost-key.pem`
const httpsDev =
  fs.existsSync(certFile) && fs.existsSync(keyFile)
    ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
    : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https: httpsDev,
  },
})
