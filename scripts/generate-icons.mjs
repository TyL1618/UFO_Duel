// Run: node scripts/generate-icons.mjs
// Requires: npm install -D sharp

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dir, '../public/icons/icon.svg')
const svg = readFileSync(svgPath)

const sizes = [192, 512]
for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(__dir, `../public/icons/icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}
