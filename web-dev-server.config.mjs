// import { hmrPlugin, presets } from '@open-wc/dev-server-hmr';
// import { esbuildPlugin } from '@web/dev-server-esbuild';
import { CodeServerMock } from './test/authorization/ServerMock.js';

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
    {
      name: 'mock-api',
      serve(context) {
        if (context.path === '/oauth2/auth-code') {
          return CodeServerMock.authRequest(context.request);
        }
        if (context.path === '/oauth2/token') {
          return CodeServerMock.tokenRequest(context);
        }
        if (context.path === '/oauth2/auth-code-custom') {
          return CodeServerMock.authRequestCustom(context.request);
        }
        if (context.path === '/oauth2/token-custom') {
          return CodeServerMock.tokenRequestCustom(context);
        }
        if (context.path === '/oauth2/password') {
          return CodeServerMock.tokenPassword(context);
        }
        if (context.path === '/oauth2/client-credentials') {
          return CodeServerMock.tokenClientCredentials(context);
        }
        if (context.path === '/oauth2/client-credentials-header') {
          return CodeServerMock.tokenClientCredentialsHeader(context);
        }
        if (context.path === '/oauth2/custom-grant') {
          return CodeServerMock.tokenCustomGrant(context);
        }
        if (context.path === '/empty-response') {
          return '';
        }
        return undefined;
      },
    },
  ],

  // preserveSymlinks: true,

  middleware: [
    function implicitAuth(context, next) {
      if (context.path === '/oauth2/auth-implicit') {
        return CodeServerMock.authRequestImplicit(context);
      }
      if (context.path === '/oauth2/auth-implicit-custom') {
        return CodeServerMock.authRequestImplicitCustom(context);
      }
      if (context.path === '/oauth2/auth-implicit-invalid-state') {
        return CodeServerMock.authRequestImplicitStateError(context);
      }
      return next();
    }
  ],
});
