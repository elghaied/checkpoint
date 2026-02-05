import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs'

// Plugin to copy sidepanel HTML to correct location and clean up
function copySidepanelHtml() {
  return {
    name: 'copy-sidepanel-html',
    closeBundle() {
      const srcPath = resolve(__dirname, 'dist/src/sidepanel/index.html')
      const destDir = resolve(__dirname, 'dist/sidepanel')
      const destPath = resolve(destDir, 'index.html')

      if (existsSync(srcPath)) {
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true })
        }
        copyFileSync(srcPath, destPath)
        // Clean up the src folder
        rmSync(resolve(__dirname, 'dist/src'), { recursive: true, force: true })
        console.log('Copied sidepanel/index.html to correct location')
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), copySidepanelHtml()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/index.js'
          if (chunkInfo.name === 'content') return 'content/index.js'
          return 'sidepanel/[name]-[hash].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  publicDir: 'public',
})
