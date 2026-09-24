import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import db from '@astrojs/db';

const buildId =
  process.env.PUBLIC_ASSET_VERSION ||
  process.env.RAILCTRL_BUILD_ID ||
  `build-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// https://astro.build/config
export default defineConfig({
  integrations: [db()],
  devToolbar: {
    enabled: false
  },
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: {
    // Reverse proxy onunde host eslesmesi degisebilir.
    checkOrigin: false
  },
  server: {
    host: '0.0.0.0',  // Ağdaki diğer cihazlardan erişim için
    port: Number(process.env.PORT) || 3000
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000
  },
  vite: {
    define: {
      __RAILCTRL_BUILD_ID__: JSON.stringify(buildId),
    },
    optimizeDeps: {
      exclude: ['bcryptjs']
    },
    server: {
      allowedHosts: [
        'localhost',
        '127.0.0.1'
      ]
    },
    preview: {
      allowedHosts: [
        'localhost',
        '127.0.0.1'
      ]
    }
  }
});
