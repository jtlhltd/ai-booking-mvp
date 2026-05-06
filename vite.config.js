import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: '/build/',
  root: path.resolve(process.cwd(), 'frontend'),
  build: {
    outDir: path.resolve(process.cwd(), 'public/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(process.cwd(), 'frontend/index.html'),
        clientDashboard: path.resolve(process.cwd(), 'frontend/pages/client-dashboard/index.html'),
        adminHub: path.resolve(process.cwd(), 'frontend/pages/admin-hub/index.html'),
        ukBusinessSearch: path.resolve(process.cwd(), 'frontend/pages/uk-business-search/index.html'),
        decisionMakerFinder: path.resolve(process.cwd(), 'frontend/pages/decision-maker-finder/index.html')
      }
    }
  }
});

