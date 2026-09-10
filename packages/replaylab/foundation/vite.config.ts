import { defineConfig, type Plugin } from 'vite';

function bundleClosurePlugin(): Plugin {
  return {
    name: 'replaylab-bundle-closure',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter(output => output.type === 'chunk')
        .map(chunk => ({
          fileName: chunk.fileName,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.keys(chunk.modules).sort(),
        }));
      this.emitFile({
        type: 'asset',
        fileName: 'bundle-closure.json',
        source: JSON.stringify({ chunks }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [bundleClosurePlugin()],
  build: {
    sourcemap: true,
    target: 'es2022',
  },
});
