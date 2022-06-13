/** @typedef {import('./types').IProxyMessageInit} IProxyMessageInit */
/** @typedef {import('./types').IProxyMessageHttpResponse} IProxyMessageHttpResponse */
/** @typedef {import('./types').IProxyMessageOauth2Response} IProxyMessageOauth2Response */
/** @typedef {import('./types').IProxyMessageInternal} IProxyMessageInternal */

/**
 * The content script proxy that proxies communication from API Console to extension's background page.
 * 
 * Note, the HTTP requests are made in isolation of the tab's session. This means user data
 * cannot be used used with the request. If the user authenticate in the API server which sets a session cookie,
 * this cookie won't be used by the request and the HTTP request will fail with 401.
 * 
 * TODO: For the future version of API Console we should consider using the external communication API
 * which allows a web page to directly connect to the background page.
 * https://developer.chrome.com/docs/extensions/mv3/messaging/#external-webpage
 */
class ApiConsoleProxy {
  constructor() {
    this._messageHandler = this._messageHandler.bind(this);
  }
  
  /**
   * Initializes the communication with the application.
   * 
   * For the future, this should use the `MessageChannel` (part of channel messaging API)
   * to establish a communication port between the console and the extension.
   */
  initialize() {
    this._setupListeners();
    this.informInstalled();
  }

  /**
   * Sets up event listeners from API Console.
   * This should be called **after** API Console initialized the communication.
   */
  _setupListeners() {
    window.addEventListener('message', this._messageHandler);
  }

  /**
   * A handler for the "message" event. It listens for messages sent by API Console.
   * 
   * @param {MessageEvent} e 
   */
  _messageHandler(e) {
    if (e.source !== window) {
      // ignore sub-frames and other content scripts.
      return;
    }
    const { data } = e;
    if (!data || !data.payload) {
      // ignore invalid messages or the ones that have no `payload` used by API Console.
      return;
    }

    switch (data.payload) {
      case 'api-console-extension-installed': this.informInstalled(); break;
      case 'api-console-request': this._proxyRequest(e.data.detail); break;
      case 'api-console-oauth2': this._proxyOauth(e.data.detail); break;
    }
  }

  /**
   * Sends a message to API Console informing it the extension is 
   * installed and ready.
   */
  informInstalled() {
    const msg = /** @type IProxyMessageInit */ ({
      'api-console-payload': 'init',
      'api-console-extension': true
    });
    window.postMessage(msg, location.origin);
  }

  /**
   * Proxies the HTTP request to the API endpoint.
   * 
   * @param {any} data 
   */
  async _proxyRequest(data) {
    const payload = /** @type IProxyMessageInternal */ ({
      payload: 'fetch',
      data,
    });
    const result = await chrome.runtime.sendMessage(payload);
    const msg = /** @type IProxyMessageHttpResponse */ ({
      'api-console-payload': 'api-console-response',
      'api-console-extension': true,
      'api-console-data': result,
    });
    window.postMessage(msg, location.origin);
  }

  /**
   * Proxies the OAuth2 authorization request.
   * 
   * @param {any} data 
   */
  async _proxyOauth(data) {
    const payload = /** @type IProxyMessageInternal */ ({
      payload: 'oauth2',
      data,
    });
    const result = await chrome.runtime.sendMessage(payload);
    const msg = /** @type IProxyMessageOauth2Response */ ({
      'api-console-payload': 'api-console-oauth2-token-response',
      'api-console-extension': true,
      'api-console-data': result,
    });
    window.postMessage(msg, location.origin);
  }
}

const proxy = new ApiConsoleProxy();
proxy.initialize();
