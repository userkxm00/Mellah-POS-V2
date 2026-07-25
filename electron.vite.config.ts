import { resolve } from 'path'
import fs from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function copyBuildIconsPlugin() {
  return {
    name: 'copy-build-icons',
    closeBundle() {
      const srcIco = resolve('build/icon.ico')
      const srcPng = resolve('build/icon.png')
      const destDir = resolve('out/main')
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }
      if (fs.existsSync(srcIco)) {
        fs.copyFileSync(srcIco, resolve(destDir, 'icon.ico'))
      }
      if (fs.existsSync(srcPng)) {
        fs.copyFileSync(srcPng, resolve(destDir, 'icon.png'))
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          'fs-extra',
          'universalify',
          'jsonfile',
          'graceful-fs',
          'electron-updater',
          'electron-store',
          'bcryptjs',
          'uuid'
        ]
      }),
      copyBuildIconsPlugin()
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
