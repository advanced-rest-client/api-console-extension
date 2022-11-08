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
  test.describe('authorization_code grant', () => {
    /** @type ProxyRequest */
    let proxy;
    test.beforeEach(async ({ page }) => {
      proxy = new ProxyRequest(page);
      await proxy.navigate();
    });

    const baseConfig = /** @type IOAuth2Authorization */ ({
      grantType: 'authorization_code',
      clientId: 'auth-code-cid',
      clientSecret: 'auth-code-cs',
      authorizationUri: 'http://localhost:8000/oauth2/auth-code',
      accessTokenUri: 'http://localhost:8000/oauth2/token',
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

    test('handles when invalid redirect', async () => {
      const config = {
        ...baseConfig,
        redirectUri: new URL('/test/authorization/wrong-redirect.html', 'http://localhost:8000').toString(),
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('invalid redirect');
      expect(tokenInfo.code).toEqual('invalid_request');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });

    test('handles when invalid access token URI', async () => {
      const config = {
        ...baseConfig,
        accessTokenUri: new URL('/invalid', 'http://localhost:8000').toString(),
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('Couldn\'t connect to the server. Authorization URI is invalid. Received status 404.');
      expect(tokenInfo.code).toEqual('request_error');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });

    test('handles no body in token response', async () => {
      const config = {
        ...baseConfig,
        accessTokenUri: new URL('/empty-response', 'http://localhost:8000').toString(),
      };
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('Couldn\'t connect to the server. Code response body is empty.');
      expect(tokenInfo.code).toEqual('request_error');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });

    test('handles custom data', async () => {
      const config = /** @type IOAuth2Authorization */ ({
        ...baseConfig,
        authorizationUri: 'http://localhost:8000/oauth2/auth-code-custom',
        accessTokenUri: 'http://localhost:8000/oauth2/token-custom',
        customData: {
          auth: {
            parameters: [{
              name: 'customQuery',
              value: 'customQueryValue'
            }]
          },
          token: {
            body: [{
              name: 'customBody',
              value: 'customBodyValue'
            }],
            headers: [{
              name: 'customHeader',
              value: 'customHeaderValue'
            }],
            parameters: [{
              name: 'customParameter',
              value: 'customParameterValue'
            }],
          },
        }
      });
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.accessToken).toEqual('token1234');
    });

    test('returns the token for PKCE extension', async () => {
      // during this test the mock server actually performs the check for the challenge and the verifier
      const config = /** @type IOAuth2Authorization */ ({
        ...baseConfig,
        pkce: true,
      });
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.accessToken).toEqual('token1234');
    });

    test('returns error when PKCE verification fails', async () => {
      // during this test the mock server actually performs the check for the challenge and the verifier
      const config = /** @type IOAuth2Authorization */ ({
        ...baseConfig,
        pkce: true,
        customData: {
          auth: {
            parameters: [{
              name: 'failPkce',
              value: 'true'
            }]
          },
        },
      });
      const tokenInfo = await proxy.proxyOauth2(config);
      expect(tokenInfo.message).toEqual('invalid code_verifier');
      expect(tokenInfo.code).toEqual('invalid_request');
      expect(tokenInfo.state).toEqual('my-state');
      expect(tokenInfo.error).toEqual(true);
    });
  });
});
