/**
 * Reads an image file selected from the local PC, resizes it using an offscreen canvas for optimal memory/storage,
 * and returns an optimized Data URL string.
 */
export function processImageFile(
  file: File,
  maxWidth = 600,
  maxHeight = 600,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const src = e.target?.result as string
      if (!src) {
        reject(new Error('Failed to read image file'))
        return
      }

      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            } else {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', quality))
          } else {
            resolve(src)
          }
        } catch {
          resolve(src)
        }
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}
