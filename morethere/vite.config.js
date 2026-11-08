import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Mount the same /api/preview handler used in production on the dev server.
function previewApi() {
  return {
    name: 'morethere-preview-api',
    async configureServer(server) {
      const { handlePreview, handlePreviewImage } = await import('./preview.mjs');
      // Connect strips the mount path; the handler only reads the query string.
      server.middlewares.use('/api/preview-image', (req, res) => handlePreviewImage(req, res));
      server.middlewares.use('/api/preview', (req, res) => handlePreview(req, res));
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'VITE_'));
  return {
    plugins: [react(), previewApi()],
    server: { host: '0.0.0.0', port: 5173 },
    preview: { host: '0.0.0.0', port: 4173 },
  };
});
