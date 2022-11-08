/** @typedef {import('../../src/types').ISafePayload} ISafePayload */
/** @typedef {import('../../src/types').IOAuth2Authorization} IOAuth2Authorization */

export class ProxyRequest {
  /**
   * @param {import('@playwright/test').Page} page 
   */
  constructor(page) {
    this.page = page;
    /** @type import('@playwright/test').Locator */
    this.urlInput = page.locator('#url');
    /** @type import('@playwright/test').Locator */
    this.methodInput = page.locator('#method');
    /** @type import('@playwright/test').Locator */
    this.headersInput = page.locator('#headers');
    /** @type import('@playwright/test').Locator */
    this.bodyInput = page.locator('#body');
  }

  async navigate() {
    await this.page.goto('./index.html');
  }

  /**
   * @param {string} url 
   * @param {string=} method 
   * @param {string=} headers 
   * @param {string=} payload 
   */
  async proxy(url, method='GET', headers='', payload='') {
    await this.fillForm(url, method, headers, payload);
    await this.submitForm();
    return this.untilResponse();
  }

  /**
   * @param {string} url 
   * @param {string=} method 
   * @param {string=} headers 
   * @param {string | ISafePayload=} payload 
   */
  async proxyEvent(url, method='GET', headers, payload) {
    const result = await this.page.evaluate(([url, method, headers, payload]) => {
      /** @type string | ISafePayload | FormData | File | undefined */
      let finalPayload = payload;
      if (finalPayload === 'FormData') {
        finalPayload = new FormData();
        finalPayload.set('txt-field', 'text field value');
        finalPayload.set('file-field', new File(['file value'], 'file.txt', { type: 'text/plain' }));
      } else if (finalPayload === 'File') {
        const contents = new Blob(['test file contents'], { type: 'text/plain' });
        finalPayload = new File([contents], 'contents.txt');
      }
      const e = new CustomEvent('api-request', {
        bubbles: true,
        cancelable: true,
        detail: {
          id: 101,
          url,
          method,
          headers,
          payload: finalPayload,
        }
      });
      document.body.dispatchEvent(e);
      return new Promise((resolve) => {
        const handler = (e) => {
          resolve(e.detail);
          window.removeEventListener('api-response', handler);
        };
        window.addEventListener('api-response', handler);
      });
    }, [url, method, headers, payload]);
    return result;
  }

  /**
   * Dispatches the event for the proxy to handle OAuth 2 authorization.
   * @param {IOAuth2Authorization} config 
   */
  async proxyOauth2(config) {
    const result = await this.page.evaluate(([detail]) => {
      const e = new CustomEvent('oauth2-token-requested', {
        bubbles: true,
        cancelable: true,
        detail,
      });
      document.body.dispatchEvent(e);
      return new Promise((resolve) => {
        const handlerSuccess = (e) => {
          resolve(e.detail);
          window.removeEventListener('oauth2-token-response', handlerSuccess);
          window.removeEventListener('oauth2-error', handlerError);
        };
        const handlerError = (e) => {
          resolve(e.detail);
          window.removeEventListener('oauth2-token-response', handlerSuccess);
          window.removeEventListener('oauth2-error', handlerError);
        };
        window.addEventListener('oauth2-token-response', handlerSuccess);
        window.addEventListener('oauth2-error', handlerError);
      });
    }, [config]);
    return result;
  }

  /**
   * @param {string} url 
   * @param {string=} method 
   * @param {string=} headers 
   * @param {string=} payload 
   */
  async fillForm(url, method='GET', headers='', payload='') {
    await this.urlInput.fill(url);
    await this.methodInput.fill(method);
    await this.headersInput.fill(headers);
    await this.bodyInput.fill(payload);
  }

  async submitForm() {
    await this.page.locator('#requestSubmit').click({ timeout: 2000 });
  }

  async untilResponse() {
    const result = await this.page.evaluate(() => {
      return new Promise((resolve) => {
        const handler = (e) => {
          resolve(e.detail);
          window.removeEventListener('api-response', handler);
        };
        window.addEventListener('api-response', handler);
      });
    });
    return result;
  }
}
