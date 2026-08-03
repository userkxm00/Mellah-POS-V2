/**
 * Pure TypeScript Code 128 (Subset B & C) SVG Barcode Generator.
 * Zero external dependencies. Renders high-density, scannable SVG barcodes.
 */

// Code 128 Patterns (values 0..106). Each entry represents bar/space widths (6 elements each, totaling 11 modules, except STOP which has 7).
const CODE128_PATTERNS: number[][] = [
  [2,1,2,2,2,2], [2,2,2,1,2,2], [2,2,2,2,2,1], [1,2,1,2,2,3], [1,2,1,3,2,2], [1,3,1,2,2,2],
  [1,2,2,2,1,3], [1,2,2,3,1,2], [1,3,2,2,1,2], [2,2,1,2,1,3], [2,2,1,3,1,2], [2,3,1,2,1,2],
  [1,1,2,2,3,2], [1,2,2,1,3,2], [1,2,2,2,3,1], [1,1,3,2,2,2], [1,2,3,1,2,2], [1,2,3,2,2,1],
  [2,2,3,2,1,1], [2,2,1,1,3,2], [2,2,1,2,3,1], [2,1,3,2,1,2], [2,2,3,1,1,2], [3,1,2,1,3,1],
  [3,1,1,2,2,2], [3,2,1,1,2,2], [3,2,1,2,2,1], [3,1,2,2,1,2], [3,2,2,1,1,2], [3,2,2,2,1,1],
  [2,1,2,1,2,3], [2,1,2,3,2,1], [2,3,2,1,2,1], [1,1,1,3,2,3], [1,3,1,1,2,3], [1,3,1,3,2,1],
  [1,1,2,3,1,3], [1,3,2,1,1,3], [1,3,2,3,1,1], [2,1,1,3,1,3], [2,3,1,1,1,3], [2,3,1,3,1,1],
  [1,1,2,1,3,3], [1,1,2,3,3,1], [1,3,2,1,3,1], [1,1,3,1,2,3], [1,1,3,3,2,1], [1,3,3,1,2,1],
  [3,1,3,1,2,1], [2,1,1,3,3,1], [2,3,1,1,3,1], [2,1,3,1,1,3], [2,1,3,3,1,1], [2,1,3,1,3,1],
  [3,1,1,1,2,3], [3,1,1,3,2,1], [3,3,1,1,2,1], [3,1,2,1,1,3], [3,1,2,3,1,1], [3,3,2,1,1,1],
  [3,1,4,1,1,1], [2,2,1,4,1,1], [4,3,1,1,1,1], [1,1,1,2,2,4], [1,1,1,4,2,2], [1,2,1,1,2,4],
  [1,2,1,4,2,1], [1,4,1,1,2,2], [1,4,1,2,2,1], [1,1,2,2,1,4], [1,1,2,4,1,2], [1,2,2,1,1,4],
  [1,2,2,4,1,1], [1,4,2,1,1,2], [1,4,2,2,1,1], [2,4,1,2,1,1], [2,2,1,1,1,4], [4,1,3,1,1,1],
  [2,4,1,1,1,2], [1,3,4,1,1,1], [1,1,1,2,4,2], [1,2,1,1,4,2], [1,2,1,2,4,1], [1,1,4,2,1,2],
  [1,2,4,1,1,2], [1,2,4,2,1,1], [4,1,1,2,1,2], [4,2,1,1,1,2], [4,2,1,2,1,1], [2,1,2,1,4,1],
  [2,1,4,1,2,1], [4,1,2,1,2,1], [1,1,1,1,4,3], [1,1,1,3,4,1], [1,3,1,1,4,1], [1,1,4,1,1,3],
  [1,1,4,3,1,1], [4,1,1,1,1,3], [4,1,1,3,1,1], [1,1,3,1,4,1], [1,1,4,1,3,1], [3,1,1,1,4,1],
  [4,1,1,1,3,1], [2,1,1,4,1,2], [2,1,1,2,1,4], [2,1,1,2,3,2], [2,3,3,1,1,1,2] // STOP pattern (index 106)
]

const START_B = 104
const START_C = 105
const STOP = 106

/**
 * Encodes text into Code 128 symbol sequence.
 * Uses Code C for numeric pairs, Code B for general ASCII.
 */
function encodeCode128(text: string): number[] {
  const clean = text.replace(/[\r\n\t]/g, '')
  if (!clean) return [START_B, 0, 106]

  const codes: number[] = []
  const isNumericOnly = /^\d+$/.test(clean) && clean.length % 2 === 0

  if (isNumericOnly) {
    // Mode C — ultra compressed 2 digits per symbol
    codes.push(START_C)
    for (let i = 0; i < clean.length; i += 2) {
      const val = parseInt(clean.substring(i, i + 2), 10)
      codes.push(val)
    }
  } else {
    // Mode B — standard ASCII
    codes.push(START_B)
    for (let i = 0; i < clean.length; i++) {
      const charCode = clean.charCodeAt(i)
      const val = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0
      codes.push(val)
    }
  }

  // Calculate Checksum (Start_Val + SUM(Position_i * Code_i)) % 103
  let checksum = codes[0]
  for (let i = 1; i < codes.length; i++) {
    checksum += i * codes[i]
  }
  checksum %= 103
  codes.push(checksum)
  codes.push(STOP)

  return codes
}

/**
 * Generates pure SVG string for a Code 128 barcode.
 */
export function generateCode128Svg(text: string, height = 40): string {
  const codes = encodeCode128(text)
  const modules: boolean[] = []

  for (const codeIdx of codes) {
    const pattern = CODE128_PATTERNS[codeIdx]
    let isBar = true
    for (const width of pattern) {
      for (let w = 0; w < width; w++) {
        modules.push(isBar)
      }
      isBar = !isBar
    }
  }

  const quietZone = 10
  const totalWidth = modules.length + quietZone * 2
  const svgHeight = height + 15

  let rectsHtml = ''
  let currentX = quietZone
  let barWidth = 0

  for (let i = 0; i < modules.length; i++) {
    if (modules[i]) {
      barWidth++
    } else {
      if (barWidth > 0) {
        rectsHtml += `<rect x="${currentX}" y="2" width="${barWidth}" height="${height}" />`
        currentX += barWidth
        barWidth = 0
      }
      currentX++
    }
  }
  if (barWidth > 0) {
    rectsHtml += `<rect x="${currentX}" y="2" width="${barWidth}" height="${height}" />`
  }

  const safeText = (text || '').replace(/[^a-zA-Z0-9_.-]/g, '')

  return `<svg viewBox="0 0 ${totalWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${svgHeight}px;">
    <rect width="${totalWidth}" height="${svgHeight}" fill="#ffffff" />
    <g fill="#000000">
      ${rectsHtml}
    </g>
    <text x="${totalWidth / 2}" y="${height + 12}" font-size="9" text-anchor="middle" font-family="monospace" fill="#000000">${safeText}</text>
  </svg>`
}
