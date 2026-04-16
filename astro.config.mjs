// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://zoningbase.com',
  trailingSlash: 'always',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
