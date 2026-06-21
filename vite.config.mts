import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label';
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    nodePolyfills(),
    react({
      babel: {
        plugins: [jotaiDebugLabel, jotaiReactRefresh, ['@babel/plugin-proposal-decorators', { legacy: true }]],
      },
    }),
  ],
});
