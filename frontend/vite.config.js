import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: true,           // permite acceder desde otras máquinas
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // tu backend local
        changeOrigin: true,
        secure: false
      }
    },
    allowedHosts: [
      'palaeobiologic-proximately-demi.ngrok-free.dev' // tu URL
    ],
    hmr: {
      clientPort: 443 // para hot reload desde ngrok HTTPS
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.qrserver\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'qr-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      },
      manifest: {
        name: 'BarberOS - Sistema de Gestión',
        short_name: 'BarberOS',
        description: 'Sistema de gestión para barberías',
        theme_color: '#3B82F6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { 
            src: '/icon-192.png', 
            sizes: '192x192', 
            type: 'image/png',
            purpose: 'any maskable'
          },
          { 
            src: '/icon-192.png', 
            sizes: '512x512', 
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
