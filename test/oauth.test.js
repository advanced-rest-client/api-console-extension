import { test as base, chromium, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ProxyRequest } from './models/ProxyRequest.js';
import { Headers } from '../src/proxy/Headers.js';

/** @typedef {import('../src/types').IApiConsoleHttpResponse} IApiConsoleHttpResponse */
/** @typedef {import('../src/types').IApiConsoleHttpResponseData} IApiConsoleHttpResponseData */

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

test.describe('app initialization', () => {
  test.only('initializes the app through the content script', async ({ page }) => {
    // page.on('console', console.log)
    await page.goto('./index.html');
    const attr = await page.locator('#request').getAttribute('hidden');
    expect(attr).toBeNull();
    console.log(page.context().serviceWorkers());
  });
});

test.describe('HTTP Proxy', () => {
  /** @type ProxyRequest */
  let proxy;
  test.beforeEach(async ({ page }) => {
    proxy = new ProxyRequest(page);
    await proxy.navigate();
  });

  test('proxies a GET request', async () => {
    const response = /** @type IApiConsoleHttpResponse */ (await proxy.proxy('https://httpbin.org/get', 'GET', 'x-test: test-value'));
    expect(response).toHaveProperty('responseData');
    expect(response).toHaveProperty('stats');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('request');
    const { stats, request } = response;
    const data = /** @type IApiConsoleHttpResponseData */ (response.responseData);
    expect(data).toHaveProperty('response');
    expect(data).toHaveProperty('responseText');
    expect(data).toHaveProperty('responseType', 'text');
    expect(data).toHaveProperty('responseURL', 'https://httpbin.org/get');
    expect(data).toHaveProperty('status', 200);
    expect(data).toHaveProperty('statusText');
    expect(data).toHaveProperty('headers');
    expect(stats).toHaveProperty('loadingTime');
    expect(stats).toHaveProperty('startTime');
    expect(request).toHaveProperty('id', response.id);
    expect(request).toHaveProperty('url', 'https://httpbin.org/get');
    const body = JSON.parse(data.response);
    const headers = new Headers(body.headers)
    expect(headers.get('x-test')).toEqual('test-value');
  });

  test('proxies a POST request with a string value', async () => {
    const response = /** @type IApiConsoleHttpResponse */ (await proxy.proxy('https://httpbin.org/post', 'POST', 'x-test: test-value\ncontent-type: text/plain', 'message body'));
    expect(response).toHaveProperty('responseData');
    expect(response).toHaveProperty('stats');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('request');
    const { stats, request } = response;
    const data = /** @type IApiConsoleHttpResponseData */ (response.responseData);
    expect(data).toHaveProperty('response');
    expect(data).toHaveProperty('responseText');
    expect(data).toHaveProperty('responseType', 'text');
    expect(data).toHaveProperty('responseURL', 'https://httpbin.org/post');
    expect(data).toHaveProperty('status', 200);
    expect(data).toHaveProperty('statusText');
    expect(data).toHaveProperty('headers');
    expect(stats).toHaveProperty('loadingTime');
    expect(stats).toHaveProperty('startTime');
    expect(request).toHaveProperty('id', response.id);
    expect(request).toHaveProperty('url', 'https://httpbin.org/post');
    const body = JSON.parse(data.response);
    const headers = new Headers(body.headers)
    expect(headers.get('x-test')).toEqual('test-value');
    expect(headers.get('content-type')).toEqual('text/plain');
    expect(body.data).toEqual('message body');
  });

  test('proxies a FormData request', async () => {
    const response = /** @type IApiConsoleHttpResponse */ (await proxy.proxyEvent('https://httpbin.org/post', 'POST', 'x-test: test-value', 'FormData'));
    expect(response).toHaveProperty('responseData');
    expect(response).toHaveProperty('stats');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('request');
    const { stats, request } = response;
    const data = /** @type IApiConsoleHttpResponseData */ (response.responseData);
    expect(data).toHaveProperty('response');
    expect(data).toHaveProperty('responseText');
    expect(data).toHaveProperty('responseType', 'text');
    expect(data).toHaveProperty('responseURL', 'https://httpbin.org/post');
    expect(data).toHaveProperty('status', 200);
    expect(data).toHaveProperty('statusText');
    expect(data).toHaveProperty('headers');
    expect(stats).toHaveProperty('loadingTime');
    expect(stats).toHaveProperty('startTime');
    expect(request).toHaveProperty('id', response.id);
    expect(request).toHaveProperty('url', 'https://httpbin.org/post');
    const body = JSON.parse(data.response);
    const headers = new Headers(body.headers)
    expect(headers.get('x-test')).toEqual('test-value');
    expect(headers.get('content-type')).toContain('multipart/form-data');
    expect(body.files).toHaveProperty('file-field', 'file value');
    expect(body.form).toHaveProperty('txt-field', 'text field value');
  });
});

// const assert = require('chai').assert;
// const ApiConsoleOauthProxy = require('../js/background.js').ApiConsoleOauthProxy;

// describe('api-console-extension', function() {
//   describe('OAuth2 proxy', function() {
//     describe('popup-url', function() {

//       var proxy;
//       var settings;
//       var popupUrl;

//       before(function() {
//         settings = {
//           authorizationUrl: 'https://authorizationUrl.com',
//           clientId: 'test-123 test',
//           redirectUrl: 'https://redirectUrl.com',
//           scopes: ['scope-1', 'scope-2']
//         };
//         proxy = new ApiConsoleOauthProxy(settings);
//         popupUrl = proxy._constructPopupUrl('token');
//       });

//       // beforeEach(function() {
//       //   proxy = new ApiConsoleOauthProxy(settings);
//       // });

//       function getParam(name) {
//         var _url = popupUrl.substr(popupUrl.indexOf('?') + 1);
//         var parts = _url.split('&');
//         for (var i = 0, len = parts.length; i < len; i++) {
//           let params = parts[i].split('=');
//           if (params[0] === name) {
//             return params[1];
//           }
//         }
//       }

//       it('Constructs OAuth URL', function() {
//         assert.isString(popupUrl);
//       });

//       it('Sets authorization URL and response_type', function() {
//         var base = settings.authorizationUrl + '?response_type=token';
//         var index = popupUrl.indexOf(base);
//         assert.equal(index, 0);
//       });

//       it('Sets client_id', function() {
//         var clientId = getParam('client_id');
//         assert.equal(clientId, 'test-123%20test');
//       });

//       it('Sets redirect_uri', function() {
//         var redirectUrl = getParam('redirect_uri');
//         assert.equal(redirectUrl, 'https%3A%2F%2FredirectUrl.com');
//       });

//       it('Sets scope', function() {
//         var scopes = getParam('scope');
//         assert.equal(scopes, 'scope-1%20scope-2');
//       });

//       it('Sets state', function() {
//         var state = getParam('state');
//         assert.isString(state);
//       });
//     });

//     describe('authDataFromUrl', function() {
//       var authData;
//       var token;
//       var tokenType;
//       var expiresIn;
//       var state;

//       before(function() {
//         var settings = {
//           authorizationUrl: 'https://authorizationUrl.com',
//           clientId: 'test-123 test',
//           redirectUrl: 'https://redirectUrl.com',
//           scopes: ['scope-1', 'scope-2']
//         };
//         token = 'ya29.GlwpBBGitx7n81P6Jdu1l43Y0M_j7WD0uVQRc3H1v6PyL0Ob6H6UrsWj';
//         token += '-rTMxXtX66_cdEbRJwHyArtR79GIGnIYfhcOBMt8qH96e9oGswGaGPkb1egRZ5UIf_qzFQ';
//         tokenType = 'Bearer';
//         state = '173mwy';
//         expiresIn = '3600';
//         var proxy = new ApiConsoleOauthProxy(settings);
//         var url = 'http://localhost:8080/components/oauth-authorization/oauth-popup.html';
//         url += '#state=' + state;
//         url += '&access_token=' + token;
//         url += '&token_type=' + tokenType;
//         url += '&expires_in=' + expiresIn;
//         authData = proxy.authDataFromUrl(url);
//       });

//       it('Has accessToken', function() {
//         assert.isString(authData.accessToken, 'accessToken is string');
//         assert.equal(authData.accessToken, token, 'Token value equals');
//       });

//       it('Has accessToken', function() {
//         assert.isString(authData.expiresIn, 'expiresIn is string');
//         assert.equal(authData.expiresIn, expiresIn, 'expiresIn equals ' + expiresIn);
//       });

//       it('Has state', function() {
//         assert.isString(authData.state, 'state is string');
//         assert.equal(authData.state, state, 'state equals ' + state);
//       });

//       it('Has tokenType', function() {
//         assert.isString(authData.tokenType, 'tokenType is string');
//         assert.equal(authData.tokenType, tokenType, 'tokenType equals ' + tokenType);
//       });
//     });
//   });
// });
