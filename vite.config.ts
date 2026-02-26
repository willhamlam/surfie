import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import webExtension from 'vite-plugin-web-extension'
import { resolve } from 'path'

const stubPath = resolve(__dirname, 'src/lib/node-stub.ts')

const NODE_MODULES = new Set([
  'stream', 'http', 'https', 'http2', 'tls', 'net', 'dns',
  'fs', 'os', 'path', 'crypto', 'zlib', 'child_process',
  'worker_threads', 'perf_hooks', 'assert', 'util', 'events',
  'buffer', 'url', 'querystring', 'string_decoder',
])

function nodeStubPlugin(): Plugin {
  return {
    name: 'node-stub',
    enforce: 'pre',
    resolveId(source) {
      // Match "node:X", "X", or "X/subpath"
      const cleaned = source.startsWith('node:') ? source.slice(5) : source
      const base = cleaned.split('/')[0]
      if (NODE_MODULES.has(base)) {
        return stubPath
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [
    nodeStubPlugin(),
    vue(),
    tailwindcss(),
    webExtension({
      manifest: 'manifest.json',
      watchFilePaths: ['manifest.json'],
      additionalInputs: ['src/sidepanel/index.html'],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.message?.includes('externalized for browser compatibility')) return
        warn(warning)
      },
    },
  },
})
