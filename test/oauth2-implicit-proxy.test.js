import { test as base, chromium, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ProxyRequest } from './models/ProxyRequest.js';

/** @typedef {import('../src/types').IOAuth2Authorization} IOAuth2Authorization */

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = join(__dirname, '..');

const test = base.extend({
  context: async ({ browserName }, use) => {
    const browserTypes = { chromium };
    const launchOptions = {
      devtools: true,
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`
      ],
      viewport: {
        width: 1920,
        height: 1080
      },
    };
    const context = await browserTypes[browserName].launchPersistentContext('', launchOptions);
    await use(context);
    await context.close();
  }
});

test.describe('OAuth 2.0 Proxy', () => {
  test.describe('implicit grant', () => {
    /** @type ProxyRequest */
    let proxy;
    test.beforeEach(async ({ page }) => {
      proxy = new ProxyRequest(page);
      await proxy.navigate();
    });

    const baseConfig = /** @type IOAuth2Authorization */ ({
      grantType: 'implicit',
      clientId: 'auth-code-cid',
      authorizationUri: 'http://localhost:8000/oauth2/auth-implicit',
      redirectUri: 'http://localhost:8000/test/authorization/popup.html',
      scopes: ['a', 'b'],
      state: 'my-state',
    });

    test('returns the token info', async () => {
      const config = {
        ...baseConfig,
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.accessToken).toEqual('token1234');
      expect(tokenInfo.tokenType).toEqual('Bearer');
      expect(tokenInfo.refreshToken).toEqual('refresh1234');
      expect(tokenInfo.expiresIn).toStrictEqual(3600);
      expect(tokenInfo.scope).toEqual(baseConfig.scopes);
      expect(tokenInfo).toHaveProperty('expiresAt');
      expect(tokenInfo.expiresAssumed).toBe(false);
    });

    test('has scopes returned by the server', async () => {
      const config = {
        ...baseConfig,
        clientId: 'custom-scopes',
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.scope).toEqual(['c1', 'c2']);
    });

    test('returns error when client_id error', async () => {
      const config = {
        ...baseConfig,
        clientId: 'invalid'
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('Client authentication failed.');
      expect(tokenInfo.code).toEqual('invalid_client');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });

    test('handles when state is different', async () => {
      const config = {
        ...baseConfig,
        authorizationUri: new URL('/oauth2/auth-implicit-invalid-state', 'http://localhost:8000').toString(),
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('The state value returned by the authorization server is invalid.');
      expect(tokenInfo.code).toEqual('invalid_state');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });
  });
});
