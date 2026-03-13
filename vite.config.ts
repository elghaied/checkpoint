/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { build as esbuild } from 'esbuild'

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
  plugins: [react(), copySidepanelHtml(), bundleContentScript()],
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
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background/index.js'
          return 'sidepanel/[name]-[hash].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  publicDir: 'public',
})
