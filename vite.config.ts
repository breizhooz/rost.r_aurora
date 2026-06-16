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

// On consomme @nutri/e2e-core depuis sa SOURCE (et non son dist/ pré-buildé) :
// Vite/esbuild compile et fait du HMR sur les .ts directement → plus aucun
// `npm run build` à relancer dans e2e-core après chaque modif. `server.fs.allow`
// autorise la lecture hors du dossier projet (le repo voisin e2e-core).
const e2eCoreSrc = fileURLToPath(new URL('../e2e-core/src/index.ts', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@nutri/e2e-core': e2eCoreSrc,
    },
  },
  server: {
    port: 5173,
    https: httpsDev,
    fs: { allow: ['..'] },
  },
})
