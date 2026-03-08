import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },

  modules: ['@nuxtjs/color-mode'],

  colorMode: {
    classSuffix: '',        // adds `.dark` / `.light` on <html>
    preference: 'dark',
    fallback: 'dark',
    storageKey: 'vb-color-mode',
  },

  css: ['~/assets/css/main.css'],

  vite: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [tailwindcss() as any],
  },

  app: {
    head: {
      title: 'VibeBridge',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Unbounded:wght@200;300;400;700&display=swap' },
        { rel: 'manifest', href: '/nuxt-ui/manifest.webmanifest' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      agentUrl: '',
      uiUrl: '',
      relayUrl: '',
      agentHost: 'devbridge.local',
      agentPort: '3333',
    },
  },
})
