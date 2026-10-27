import { mergeConfig } from 'vite'
import base from './vite.config'

const config = mergeConfig(base, {
  server: {
    host: '127.0.0.1', port: 15177, strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:18084', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:18084', ws: true, changeOrigin: true },
      '/oauth2': { target: 'http://127.0.0.1:18084' },
      '/login/oauth2': { target: 'http://127.0.0.1:18084' },
      '/uploads': { target: 'http://127.0.0.1:18084' },
    },
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:18084/api'),
    'import.meta.env.VITE_WS_BASE_URL': JSON.stringify('http://127.0.0.1:18084'),
    'import.meta.env.VITE_MEDIA_BASE_URL': JSON.stringify('http://127.0.0.1:18084'),
  },
})
delete config.server.proxy['/login']
export default config
