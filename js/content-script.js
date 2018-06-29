/**
 * Handles communication between API console and the background page.
 */
class ApiConsoleExtensionProxy {
  /**
   * @constructor
   */
  constructor() {
    this._onMessage = this._onMessage.bind(this);
    this._consoleReadyHandler = this._consoleReadyHandler.bind(this);
  }
  /**
   * Attach event listeners to the window.
   */
  listen() {
    window.addEventListener('api-console-ready', this._consoleReadyHandler);
    window.addEventListener('message', this._onMessage);
  }
  /**
   * Message handler on the window object.
   * @param {MessageEvent} e
   */
  _onMessage(e) {
    if (e.source !== window) {
      return;
    }
    const message = e.data || {};
    if (!message.payload || message['api-console-extension']) {
      return;
    }
    switch (message.payload) {
      case 'api-console-extension-installed':
        this.informInstalled();
        break;
      case 'api-console-request':
        this.proxyRequest(e.data.detail);
        break;
      case 'api-console-oauth2':
        this.proxyOauth(e.data.detail);
        break;
    }
  }
  /**
   * Handler for the `api-console-ready` custom event.
   */
  _consoleReadyHandler() {
    this.informInstalled();
  }
  /**
   * Informs the console that the extension is installed.
   * The communication is handled by `api-console-ext-comm` custom element.
   */
  informInstalled() {
    window.postMessage({
      'api-console-payload': 'init',
      'api-console-extension': true
    }, location.origin);
  }
  /**
   * Proxies request data to the background page.
   * @param {Object} data Request data received from the console
   */
  proxyRequest(data) {
    chrome.runtime.sendMessage({
      payload: 'xhr-data',
      data: data
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      window.postMessage({
        'api-console-payload': 'api-console-response',
        'api-console-extension': true,
        'api-console-data': response
      }, location.origin);
    });
  }
  /**
   * Proxies OAuth token request to the background page
   * @param {Object} data Token request details.
   */
  proxyOauth(data) {
    chrome.runtime.sendMessage({
      payload: 'oauth2-data',
      data: data
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      window.postMessage({
        'api-console-payload': 'api-console-oauth2-token-response',
        'api-console-extension': true,
        'api-console-data': response
      }, location.origin);
    });
  }
}

(function() {
  const proxy = new ApiConsoleExtensionProxy();
  proxy.listen();
})();
