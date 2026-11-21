import {defineConfig} from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'experiments/likely32-vector/embedding-backtest.cjs',
    outDir: 'server/dist/likely32',
    emptyOutDir: true,
    commonjsOptions: {include: [/node_modules/, /experiments\/likely32-vector/]},
    rollupOptions: {
      output: {format: 'cjs', entryFileNames: 'embedding-backtest.cjs'},
    },
  },
});
