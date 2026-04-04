import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/zip.js <firefox|chrome>')
  process.exit(1)
}

const base = JSON.parse(readFileSync(resolve('manifests/base.json'), 'utf-8'))
const version = base.version
const distDir = resolve(`dist/${target}`)
const zipName = `instagram-reels-controls-${target}-v${version}.zip`
const zipPath = resolve(`dist/${zipName}`)

execSync(`cd "${distDir}" && zip -r "${zipPath}" .`)
console.log(`Built ${zipName}`)
