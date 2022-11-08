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
  test.describe('client credentials grant', () => {
    test.describe('Body delivery method', () => {
      /** @type ProxyRequest */
      let proxy;
      test.beforeEach(async ({ page }) => {
        proxy = new ProxyRequest(page);
        await proxy.navigate();
      });
  
      const baseConfig = /** @type IOAuth2Authorization */ ({
        grantType: 'client_credentials',
        clientId: 'auth-code-cid',
        clientSecret: 'cc-secret',
        scopes: ['a', 'b'],
        accessTokenUri: 'http://localhost:8000/oauth2/client-credentials',
      });
  
      test('returns the token info', async () => {
        const config = {
          ...baseConfig,
        };
        const tokenInfo = await proxy.proxyOauth2(config);
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
        expect(tokenInfo.message).toEqual('invalid client id');
        expect(tokenInfo.code).toEqual('invalid_client');
        expect(tokenInfo.error).toEqual(true);
      });
  
      test('handles when invalid secret', async () => {
        const config = {
          ...baseConfig,
          clientSecret: 'invalid',
        };
        const tokenInfo = await proxy.proxyOauth2(config);
        expect(tokenInfo.message).toEqual('invalid secret');
        expect(tokenInfo.code).toEqual('invalid_client');
        expect(tokenInfo.error).toEqual(true);
      });
    });

    test.describe('Headers delivery method', () => {
      /** @type ProxyRequest */
      let proxy;
      test.beforeEach(async ({ page }) => {
        proxy = new ProxyRequest(page);
        await proxy.navigate();
      });
  
      const baseConfig = /** @type IOAuth2Authorization */ ({
        grantType: 'client_credentials',
        clientId: 'auth-code-cid',
        clientSecret: 'cc-secret',
        scopes: ['a', 'b'],
        accessTokenUri: 'http://localhost:8000/oauth2/client-credentials-header',
        deliveryMethod: 'header', 
        deliveryName: 'authorization',
      });
  
      test('returns the token info', async () => {
        const config = {
          ...baseConfig,
        };
        const tokenInfo = await proxy.proxyOauth2(config);
        expect(tokenInfo.accessToken).toEqual('token1234');
        expect(tokenInfo.tokenType).toEqual('Bearer');
        expect(tokenInfo.refreshToken).toEqual('refresh1234');
        expect(tokenInfo.expiresIn).toStrictEqual(3600);
        expect(tokenInfo.scope).toEqual(baseConfig.scopes);
        expect(tokenInfo).toHaveProperty('expiresAt');
        expect(tokenInfo.expiresAssumed).toBe(false);
      });
    });

    test.describe('custom data', () => {
      /** @type ProxyRequest */
      let proxy;
      test.beforeEach(async ({ page }) => {
        proxy = new ProxyRequest(page);
        await proxy.navigate();
      });
  
      const baseConfig = /** @type IOAuth2Authorization */ ({
        grantType: 'client_credentials',
        clientId: 'auth-code-cid',
        clientSecret: 'cc-secret',
        scopes: ['a', 'b'],
        accessTokenUri: 'http://localhost:8000/oauth2/client-credentials',
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
  
      test('applies all custom data', async () => {
        const config = {
          ...baseConfig,
        };
        const tokenInfo = await proxy.proxyOauth2(config);
        expect(tokenInfo.accessToken).toEqual('token1234');
      });
    });
  });
});
