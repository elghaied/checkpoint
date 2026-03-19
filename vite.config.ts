/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { build as esbuild } from 'esbuild'

// Plugin to copy HTML entry points to correct locations and clean up
function copyHtmlEntries() {
  return {
    name: 'copy-html-entries',
    closeBundle() {
      const entries = [
        { src: 'dist/src/sidepanel/index.html', dest: 'dist/sidepanel/index.html' },
        { src: 'dist/src/import/index.html', dest: 'dist/import/index.html' },
      ]

      for (const entry of entries) {
        const srcPath = resolve(__dirname, entry.src)
        const destDir = resolve(__dirname, entry.dest, '..')
        const destPath = resolve(__dirname, entry.dest)

        if (existsSync(srcPath)) {
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
          }
          copyFileSync(srcPath, destPath)
        }
      }

      // Clean up the src folder
      const srcDir = resolve(__dirname, 'dist/src')
      if (existsSync(srcDir)) {
        rmSync(srcDir, { recursive: true, force: true })
      }
      console.log('Copied HTML entries to correct locations')
    }
  }
}

// Build content script as a self-contained IIFE via esbuild.
// chrome.scripting.executeScript injects files as classic scripts (not ES modules),
// so the content script cannot use import statements.
function bundleContentScript() {
  return {
    name: 'bundle-content-script',
    async closeBundle() {
      await esbuild({
        entryPoints: [resolve(__dirname, 'src/content/index.ts')],
        bundle: true,
        outfile: resolve(__dirname, 'dist/content/index.js'),
        format: 'iife',
        target: 'es2020',
        minify: true,
        alias: {
          '@': resolve(__dirname, 'src'),
        },
        define: {
          'import.meta.env.DEV': 'false',
        },
      })
      console.log('Bundled content script as self-contained IIFE')
    }
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__mocks__/chrome.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**', 'src/background/**', 'src/storage/**'],
    },
  },
  plugins: [react(), copyHtmlEntries(), bundleContentScript()],
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
        import: resolve(__dirname, 'src/import/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/index.js'
          if (chunkInfo.name === 'import') return 'import/[name]-[hash].js'
          return 'sidepanel/[name]-[hash].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  publicDir: 'public',
})
