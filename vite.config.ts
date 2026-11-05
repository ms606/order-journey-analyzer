/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

import { PRODUCTION_CSP } from './config/csp';

export { PRODUCTION_CSP };

function productionCsp(): Plugin {
  return {
    name: 'order-journey-production-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const charset = '<meta charset="UTF-8" />';
        if (!html.includes(charset)) throw new Error('index.html must contain <meta charset="UTF-8" /> for the CSP to follow it');
        // Placed straight after the charset and before any script, with literal quotes.
        return html.replace(charset, `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), productionCsp()],
  build: {
    target: 'es2020',
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 5000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
