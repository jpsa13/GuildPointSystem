import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

export default mergeConfig(base, defineConfig({
  server: {
    host: '127.0.0.1', port: 15175, strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:18082', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:18082', ws: true, changeOrigin: true },
      '/oauth2': { target: 'http://127.0.0.1:18082', changeOrigin: true },
      '/login': { target: 'http://127.0.0.1:18082', changeOrigin: true, bypass: req => req.url?.startsWith('/login/oauth2') ? undefined : req.url },
      '/uploads': { target: 'http://127.0.0.1:18082', changeOrigin: true },
    },
  },
}))
