import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Plugin to auto-generate motif manifest from public/motifs/
function motifManifestPlugin() {
  return {
    name: 'motif-manifest',
    buildStart() {
      const motifDir = path.resolve(__dirname, 'public/motifs')
      if (!fs.existsSync(motifDir)) fs.mkdirSync(motifDir, { recursive: true })
      const exts = ['.png', '.jpg', '.jpeg', '.webp']
      const files = fs.readdirSync(motifDir)
        .filter(f => exts.includes(path.extname(f).toLowerCase()))
        .map(f => ({ name: path.basename(f, path.extname(f)), file: `/motifs/${f}` }))
      fs.writeFileSync(
        path.resolve(__dirname, 'public/motif-manifest.json'),
        JSON.stringify(files, null, 2)
      )
    },
    configureServer(server) {
      // Also regenerate on dev server file changes
      server.watcher.on('add', regenerate)
      server.watcher.on('unlink', regenerate)
      function regenerate(file) {
        if (!file.includes('public/motifs')) return
        const motifDir = path.resolve(__dirname, 'public/motifs')
        const exts = ['.png', '.jpg', '.jpeg', '.webp']
        const files = fs.existsSync(motifDir)
          ? fs.readdirSync(motifDir)
              .filter(f => exts.includes(path.extname(f).toLowerCase()))
              .map(f => ({ name: path.basename(f, path.extname(f)), file: `/motifs/${f}` }))
          : []
        fs.writeFileSync(
          path.resolve(__dirname, 'public/motif-manifest.json'),
          JSON.stringify(files, null, 2)
        )
        server.ws.send({ type: 'full-reload' })
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), motifManifestPlugin()],
  base: './'
})
