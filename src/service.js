import { HttpProxy } from './proxy/HttpProxy.js';
import { OAuth2Proxy } from './proxy/OAuth2Proxy.js';

/** @typedef {import('./types').IApiConsoleHttpRequest} IApiConsoleHttpRequest */
/** @typedef {import('./types').IOAuth2Authorization} IOAuth2Authorization */
/** @typedef {import('./types').IProxyMessageInternal} IProxyMessageInternal */

class ApiConsoleService {
  /**
   * @param {(response?: any) => void} sendResponseFunction 
   */
  constructor(sendResponseFunction) {
    /** @type {(response?: any) => void} */
    this.sendResponse = sendResponseFunction;
  }

  /**
   * Handles a message from the content script.
   * @param {IProxyMessageInternal} message 
   */
  handleRequest(message) {
    if (!message || !message.payload) {
      return;
    }
    switch (message.payload) {
      case 'fetch': this.handleFetch(/** @type IApiConsoleHttpRequest */(message.data)); break;
      case 'oauth2': this.handleOAuth2(/** @type IOAuth2Authorization */ (message.data)); break;
      default: this.reportError('Unknown payload');
    }
  }

  /**
   * @param {IApiConsoleHttpRequest} data 
   */
  async handleFetch(data) {
    const proxy = new HttpProxy(data);
    const result = await proxy.execute();
    result.id = data.id;
    this.sendResponse(result);
  }

  /**
   * 
   * @param {IOAuth2Authorization} data 
   */
  async handleOAuth2(data) {
    const proxy = new OAuth2Proxy(data);
    try {
      const result = await proxy.authorize();
      this.sendResponse(result)
    } catch (e) {
      this.sendResponse({
        'message': e.message || 'The request is invalid.',
        'code': 'invalid_request',
        'error': true
      });
    }
  }

  /**
   * Sends a general error message to the content script.
   * 
   * @param {string} message 
   */
  reportError(message) {
    this.sendResponse({
      error: true,
      message,
    });
  }
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  const handler = new ApiConsoleService(sendResponse);
  handler.handleRequest(message);
  return true;
});
