import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

interface Manifest {
  version: string
}

const target = process.argv[2]
if (!target) {
  console.error('Usage: npx tsx scripts/zip.ts <firefox|chrome>')
  process.exit(1)
}

const base: Manifest = JSON.parse(readFileSync(resolve('manifests/base.json'), 'utf-8')) as Manifest
const distDir = resolve(`dist/${target}`)
const zipName = `instagram-reels-controls-${target}-v${base.version}.zip`
const zipPath = resolve(`dist/${zipName}`)

execSync(`cd "${distDir}" && zip -r "${zipPath}" .`)
console.log(`Built ${zipName}`)
