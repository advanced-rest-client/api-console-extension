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
  test('initializes the app through the content script', async ({ page }) => {
    await page.goto('./index.html');
    const attr = await page.locator('#request').getAttribute('hidden');
    expect(attr).toBeNull();
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

  test('proxies a File request', async () => {
    const response = /** @type IApiConsoleHttpResponse */ (await proxy.proxyEvent('https://httpbin.org/post', 'POST', 'x-test: test-value\ncontent-type: text/plain', 'File'));
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
    expect(headers.get('content-type')).toContain('text/plain');
    expect(body.data).toEqual('test file contents');
  });
});
