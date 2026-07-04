import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // تحديث التطبيق تلقائياً عند دفع كود جديد
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'منصة لين | MeetLeen',
        short_name: 'لِين',
        description: 'منصة أتمتة ذكية للتجارة الإلكترونية بالأصوات',
        theme_color: '#ffffff',      // لون شريط النظام العلوى
        background_color: '#ffffff', // لون شاشة البدء (Splash Screen)
        display: 'standalone',       // إخفاء شريط المتصفح ليعمل كتطبيق هاتف حقيقي
        orientation: 'portrait',     // تثبيت الشاشة بالطول لمنع التشوه
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // مهم جداً لأندرويد لتناسب الأيقونة مع واجهات الهواتف المختلفة
          }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    host: true
  }
})
