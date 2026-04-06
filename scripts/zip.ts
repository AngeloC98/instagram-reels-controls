import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { resolve, relative, join } from 'path'
import { deflateRawSync } from 'zlib'

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

function collectFiles(dir: string): string[] {
  const entries: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      entries.push(...collectFiles(full))
    } else {
      entries.push(full)
    }
  }
  return entries
}

function createZip(files: string[], baseDir: string): Buffer {
  const centralEntries: Buffer[] = []
  const localEntries: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const rel = relative(baseDir, file).replace(/\\/g, '/')
    const data = readFileSync(file)
    const compressed = deflateRawSync(data)
    const nameBuffer = Buffer.from(rel, 'utf-8')

    // CRC-32
    let crc = ~0
    for (const byte of data) {
      crc ^= byte
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
      }
    }
    crc = ~crc >>> 0

    // Local file header
    const local = Buffer.alloc(30 + nameBuffer.length + compressed.length)
    local.writeUInt32LE(0x04034b50, 0) // signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // compression: deflate
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    nameBuffer.copy(local, 30)
    compressed.copy(local, 30 + nameBuffer.length)
    localEntries.push(local)

    // Central directory entry
    const central = Buffer.alloc(46 + nameBuffer.length)
    central.writeUInt32LE(0x02014b50, 0) // signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(8, 10) // compression: deflate
    central.writeUInt16LE(0, 12) // mod time
    central.writeUInt16LE(0, 14) // mod date
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // comment length
    central.writeUInt16LE(0, 34) // disk number
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(0, 38) // external attributes
    central.writeUInt32LE(offset, 42) // local header offset
    nameBuffer.copy(central, 46)
    centralEntries.push(central)

    offset += local.length
  }

  const centralDir = Buffer.concat(centralEntries)
  const centralDirOffset = offset

  // End of central directory
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // central dir disk
  eocd.writeUInt16LE(files.length, 8) // entries on disk
  eocd.writeUInt16LE(files.length, 10) // total entries
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(centralDirOffset, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localEntries, centralDir, eocd])
}

const files = collectFiles(distDir)
const zip = createZip(files, distDir)
writeFileSync(zipPath, zip)
console.log(`Built ${zipName} (${(zip.length / 1024).toFixed(1)} kB)`)
