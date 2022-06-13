// import { hmrPlugin, presets } from '@open-wc/dev-server-hmr';
// import { esbuildPlugin } from '@web/dev-server-esbuild';

export default /** @type {import('@web/dev-server').DevServerConfig} */ ({
  // open: '/demo/',
  watch: true,
  /** Resolve bare module imports */
  nodeResolve: {
    exportConditions: ['browser', 'development'],
  },

  // mimeTypes: {
  //   // serve all json files as js
  //   // '**/*.json': 'js',
  //   // serve .module.css files as js
  // },

  /** Compile JS for older browsers. Requires @web/dev-server-esbuild plugin */
  // esbuildTarget: 'auto'

  /** Set appIndex to enable SPA routing */
  // appIndex: 'demo/index.html',

  plugins: [
  ],

  // preserveSymlinks: true,

  // See documentation for all available options
});
