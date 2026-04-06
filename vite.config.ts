import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'fs'

type ManifestData = Record<string, unknown>

function getTarget(): string {
  const args = process.argv
  const idx = args.indexOf('--')
  if (idx !== -1) {
    const targetArg = args[idx + 1]
    if (targetArg?.startsWith('--target=')) {
      return targetArg.split('=')[1] ?? 'firefox'
    }
  }
  return 'firefox'
}

function readManifest(path: string): ManifestData {
  return JSON.parse(readFileSync(path, 'utf-8')) as ManifestData
}

function extensionPlugin(target: string) {
  return {
    name: 'extension-build',
    closeBundle() {
      const outDir = resolve(import.meta.dirname, `dist/${target}`)
      mkdirSync(outDir, { recursive: true })

      const base = readManifest(resolve(import.meta.dirname, 'manifests/base.json'))
      const override = readManifest(resolve(import.meta.dirname, `manifests/${target}.json`))
      const manifest = { ...base, ...override }
      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

      cpSync(resolve(import.meta.dirname, 'content.css'), resolve(outDir, 'content.css'))
      cpSync(resolve(import.meta.dirname, 'icons'), resolve(outDir, 'icons'), { recursive: true })
    },
  }
}

const target = getTarget()

export default defineConfig({
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'InstagramReelsControls',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  plugins: [extensionPlugin(target)],
})
