import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{ name: 'replaylab-server-closure', generateBundle(_options, bundle) {
    this.emitFile({ type: 'asset', fileName: 'bundle-closure.json', source: JSON.stringify({ chunks: Object.values(bundle).filter(output => output.type === 'chunk').map(chunk => ({ fileName: chunk.fileName, modules: Object.keys(chunk.modules), imports: chunk.imports })) }, null, 2) });
  } }],
  build: {
    ssr: true,
    outDir: 'server-dist',
    target: 'node22',
    rollupOptions: {
      input: { 'server-entry': 'src/server-entry.ts', 'room-cli': 'src/room-cli.ts' },
      output: { entryFileNames: '[name].js' },
    },
  },
});
