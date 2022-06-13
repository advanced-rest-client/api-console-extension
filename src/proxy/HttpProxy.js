import { Headers as ProxyHeaders } from './Headers.js';
import { PayloadSerializer } from './PayloadSerializer.js';

/** @typedef {import('../types').IApiConsoleHttpRequest} IApiConsoleHttpRequest */
/** @typedef {import('../types').IApiConsoleHttpResponse} IApiConsoleHttpResponse */

export class HttpProxy {
  /**
   * @param {IApiConsoleHttpRequest} request The request to proxy.
   */
  constructor(request) {
    /** @type IApiConsoleHttpRequest */
    this.request = request;
  }

  /**
   * @returns {Promise<IApiConsoleHttpResponse>}
   */
  async execute() {
    const startTime = Date.now();
    /** @type IApiConsoleHttpResponse */
    let result;
    try {
      result = await this._proxy(startTime); 
    } catch (e) {
      result = /** @type IApiConsoleHttpResponse */ ({
        responseData: {
          error: true,
          message: e.message,
        },
        stats: {
          loadingTime: 0,
          startTime,
        }
      });
    }
    return result;
  }

  /**
   * @param {number} startTime
   * @returns {Promise<IApiConsoleHttpResponse>}
   * @protected
   */
  async _proxy(startTime) {
    const { method='GET', url } = this.request;
    const init = /** @type RequestInit */ ({
      method,
    });
    if (this.request.headers) {
      const values = new ProxyHeaders(this.request.headers);
      const headers = new Headers();
      values.forEach((value, name) => {
        headers.append(name, value);
      });
      init.headers = headers;
    }
    if (this.request.payload) {
      const payload = await PayloadSerializer.deserialize(this.request.payload);
      init.body = payload;
    }
    const rsp = await fetch(url, init);
    const loadingTime = Date.now() - startTime;
    const txt = await rsp.text();
    const responseHeaders = new ProxyHeaders();
    rsp.headers.forEach((value, key) => {
      responseHeaders.append(key, value);
    });
    const result = /** @type IApiConsoleHttpResponse */ ({
      responseData: {
        response: txt,
        responseText: txt,
        responseType: 'text',
        responseURL: rsp.url,
        status: rsp.status,
        statusText: rsp.statusText,
        readyState: 4,
        headers: responseHeaders.toString(),
      },
      stats: {
        loadingTime,
        startTime,
      }
    });
    return result;
  }
}
