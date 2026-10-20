import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  plugins: [vue()],
  // 关闭 esbuild 转译（本机沙箱无法启动 esbuild 子进程），由 Rollup 输出 ESNext
  esbuild: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: {
      // 直接使用预构建的浏览器 ESM，避免 define 替换触发 esbuild
      vue: fileURLToPath(new URL('../node_modules/vue/dist/vue.runtime.esm-browser.prod.js', import.meta.url))
    }
  },
  build: {
    target: 'esnext',
    minify: false,
    cssMinify: false,
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3087',
        changeOrigin: true
      }
    }
  }
})
