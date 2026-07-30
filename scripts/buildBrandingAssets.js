const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const toIco = require('to-ico')

const rootDir = process.cwd()
const iconSvgPath = path.join(rootDir, '17', '3_icon_source.svg')
const wordmarkSvgPath = path.join(rootDir, '17', '4_wordmark_source.svg')
const buildDir = path.join(rootDir, 'build')

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true })
}

// 1. Correct wordmark SVG (fixing dx text overlap issue)
const fixedWordmarkSvg = `<svg width="900" height="220" viewBox="0 0 900 220" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="180" height="180" rx="40" fill="#0A6EDB"/>
  <path d="M69,152 L69,68 L110,113 L151,68 L151,152"
        fill="none" stroke="#FFFFFF" stroke-width="18"
        stroke-linecap="round" stroke-linejoin="round"/>
  <text x="235" y="110" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800" fill="#0B1F33">MELLAH</text>
  <text x="515" y="110" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800" fill="#0A6EDB">POS</text>
  <text x="235" y="155" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="500" fill="#6B7280">Point of Sale System</text>
</svg>`

fs.writeFileSync(wordmarkSvgPath, fixedWordmarkSvg)
fs.writeFileSync(path.join(buildDir, 'wordmark.svg'), fixedWordmarkSvg)

// Render wordmark PNG
const wordmarkResvg = new Resvg(fixedWordmarkSvg, { fitTo: { mode: 'width', value: 900 } })
const wordmarkPngBuffer = wordmarkResvg.render().asPng()
fs.writeFileSync(path.join(buildDir, 'wordmark.png'), wordmarkPngBuffer)
console.log('✅ Generated build/wordmark.png')

// 2. Render Icon PNG & ICO across multiple resolutions
const iconSvgContent = fs.readFileSync(iconSvgPath, 'utf8')
fs.writeFileSync(path.join(buildDir, 'icon.svg'), iconSvgContent)

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPngBuffers = []

for (const size of icoSizes) {
  const resvg = new Resvg(iconSvgContent, {
    fitTo: { mode: 'width', value: size }
  })
  icoPngBuffers.push(resvg.render().asPng())
}

const resvg512 = new Resvg(iconSvgContent, {
  fitTo: { mode: 'width', value: 512 }
})
fs.writeFileSync(path.join(buildDir, 'icon.png'), resvg512.render().asPng())

// Write multi-resolution ICO
toIco(icoPngBuffers).then((icoBuf) => {
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
  console.log('✅ Generated multi-res build/icon.ico (16px..256px) and build/icon.png (512px)')
}).catch((err) => {
  console.error('Failed to generate ICO:', err)
})
