/**
 * @license
 * Copyright 2016 The Advanced REST client authors <arc@mulesoft.com>
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const isNode = !!(typeof module !== 'undefined' && module.exports);
const isExtension = !!(typeof chrome !== 'undefined' &&
  chrome.runtime && chrome.runtime.onMessage);
/**
 * A parser for the payload message.
 */
class PayloadParser {
  /**
   * Expecting the input string is a url encoded string.
   * @param {String} str A string to decode.
   * @return {Array<Object>} An array of objects with "name" and "value" keys.
   */
  static parseString(str) {
    const result = [];
    if (!str || typeof str !== 'string') {
      return result;
    }
    const list = Array.from(String(result).trim());
    let state = 0; // means searching for a key, 1 - value.
    let key = '';
    let value = '';
    let tempObj = {};
    while (true) {
      let ch = list.shift();
      if (ch === undefined) {
        if (tempObj.name) {
          tempObj.value = value;
          result.push(tempObj);
        }
        break;
      }
      if (state === 0) {
        if (ch === '=') {
          tempObj.name = key;
          key = '';
          state = 1;
        } else {
          key += ch;
        }
      } else {
        if (ch === '&') {
          tempObj.value = value;
          value = '';
          state = 0;
          result.push(tempObj);
          tempObj = {};
        } else {
          value += ch;
        }
      }
    }
    return result;
  }
}

/**
 * A proxy class for making CORS XHR requests for the API console.
 */
class ApiConsoleRequestProxy {
  /**
   * @param {Object} request A request object sent by the CS page.
   */
  constructor(request) {
    // HTTP mthod
    this.method = request.method;
    // Request URL
    this.url = request.url;
    // Request headers
    this.headers = request.headers;
    // Request body
    this.payload = request.payload;
    // Log messages
    this.log = [];
    this._onload = this._loadHandler.bind(this);
    this._onerror = this._errorHandler.bind(this);
  }
  /**
   * Makes the request.
   * @return {Promise}
   */
  execute() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.startDate = Date.now();
      try {
        this._makeRequest();
      } catch (e) {
        this._errorHandler(e);
      }
    });
  }
  /**
   * Performs the HTTP request.
   */
  _makeRequest() {
    const xhr = new XMLHttpRequest();
    xhr.open(this.method, this.url, true);
    this.setHeaders(this.headers, xhr);
    xhr.addEventListener('load', this._onload);
    xhr.addEventListener('error', this._onerror);
    xhr.addEventListener('timeout', this._onerror);
    let data;
    if (['GET', 'HEAD'].indexOf(this.method) === -1) {
      data = PayloadParser.parseString(this.payload);
    }
    this.startTime = window.performance.now();
    xhr.send(data);
  }
  /**
   * Sets the request headers to the request object.
   *
   * @param {String} data The headers to set as a HTTP headers string
   * @param {XMLHttpRequest} xhr The XMLHttpRequest object.
   */
  setHeaders(data, xhr) {
    if (!data) {
      return;
    }
    const headers = data.split(/\n(?=[^ \t]+)/gim);
    for (let i = 0, len = headers.length; i < len; i++) {
      const line = headers[i].trim();
      if (line === '') {
        continue;
      }
      let name;
      let value = '';
      const sepPosition = line.indexOf(':');
      if (sepPosition === -1) {
        name = line;
      } else {
        name = line.substr(0, sepPosition);
        value = line.substr(sepPosition + 1).trim();
      }
      try {
        xhr.setRequestHeader(name, value);
      } catch (e) {
        const msg = `Can't set header ${name} on the request.`;
        console.error(msg, e);
        this.log.push(msg);
      }
    }
  }
  /**
   * Resolves main promise with error message.
   * @param {Error} e An error object if any
   */
  _errorHandler(e) {
    const loadTime = this.startTime ?
      window.performance.now() - this.startTime : 0;
    const result = {
      isError: true,
      error: e.message || 'Network error.',
      loadingTime: loadTime
    };
    this.publishResult(result);
  }
  /**
   * Handler for load event on XHR object.
   * @param {ProgressEvent} e
   */
  _loadHandler(e) {
    const loadTime = window.performance.now() - this.startTime;
    const xhr = e.target;
    const result = {
      isError: false,
      isXhr: true,
      loadingTime: loadTime,
      response: {
        status: xhr.status,
        statusText: xhr.statusText,
        payload: xhr.response,
        headers: xhr.getAllResponseHeaders()
      }
    };
    this.publishResult(result);
  }
  /**
   * Resolves main promise with the response.
   * @param {Object} result API components response data object.
   */
  publishResult(result) {
    const messgae = {
      data: result,
      log: this.log
    };
    this.resolve(messgae);
    delete this.resolve;
  }
}
/**
 * Gets a OAuth token using Chrome's APIs
 */
class ApiConsoleOauthProxy {
  /**
   * @param {Object} settings Token request paramns.
   */
  constructor(settings) {
    this.settings = settings;
    this.type = settings.type;
    this.state = settings.state || this.randomString(6);
    this.errored = false;

    this._tabUpdated = this._tabUpdated.bind(this);
    this._tabClosed = this._tabClosed.bind(this);
    this._frameLoadErrorHandler = this._frameLoadErrorHandler.bind(this);
    this._frameLoadHandler = this._frameLoadHandler.bind(this);
  }
  /**
   * Adds event listener to tabs to observe for changes
   */
  addHandlers() {
    chrome.tabs.onUpdated.addListener(this._tabUpdated);
    chrome.tabs.onRemoved.addListener(this._tabClosed);
  }
  /**
   * Removes event listener from tabs.
   */
  removeHandlers() {
    chrome.tabs.onUpdated.removeListener(this._tabUpdated);
    chrome.tabs.onRemoved.removeListener(this._tabClosed);
  }

  /**
   * Clears the state of the element.
   */
  clear() {
    this.state = undefined;
    this.settings = undefined;
    this._cleanupFrame();
    this.removeHandlers();
  }
  /**
   * A handler called each time a tab has been updated.
   * @param {Number} tabId
   * @param {Object} changeInfo
   * @param {Object} tab
   */
  _tabUpdated(tabId, changeInfo, tab) {
    if (this._popupTabInfo) {
      if (this._popupTabInfo.tabId !== tabId) {
        return;
      }
      const redirect = this.settings.redirectUri || this.settings.redirectUrl;
      if (changeInfo.url && changeInfo.url.indexOf(redirect) !== -1) {
        this._handlingPopupResponse = true;
        const authData = this.authDataFromUrl(changeInfo.url);
        this.processAuthResponse(authData);
        chrome.tabs.remove(tabId);
      }
    } else {
      if (changeInfo && changeInfo.url === 'about:blank' && this._initUrl) {
        this._popupTabInfo = {
          tabId: tabId,
          tab: tab
        };
        chrome.tabs.update(tabId, {
          url: this._initUrl
        });
      }
    }
  }
  /**
   * A handler for tab close.
   * If closed tab is the one with authorization dialog.
   *
   * @param {Number} tabId
   */
  _tabClosed(tabId) {
    if (!this._popupTabInfo || this._popupTabInfo.tabId !== tabId) {
      return;
    }
    if (this._handlingPopupResponse) {
      return;
    }
    this._finish({
      message: 'No response has been recorded.',
      code: 'no_response',
      error: true
    });
  }
  /**
   * Performs the authorization.
   * @return {Promise}
   */
  authorize() {
    return new Promise((resolve) => {
      this._resolver = resolve;
      const settings = this.settings;
      switch (this.type) {
        case 'implicit':
          this._authorize(this._constructPopupUrl(settings, 'token'), settings);
          break;
        case 'authorization_code':
          this._authorize(this._constructPopupUrl(settings, 'code'), settings);
          break;
        case 'client_credentials':
          this.authorizeClientCredentials(settings);
          break;
        case 'password':
          this.authorizePassword(settings);
          break;
        default:
          this.authorizeCustomGrant(settings)
          .catch(() => {});
      }
    });
  }
  /**
   * Browser or server flow: open the initial popup.
   * @param {Object} settings Settings passed to the authorize function.
   * @param {String} type `token` or `code`
   * @return {String} Full URL for the endpoint.
   */
  _constructPopupUrl(settings, type) {
    let url = settings.authorizationUri || settings.authorizationUrl;
    if (url.indexOf('?') === -1) {
      url += '?';
    } else {
      url += '&';
    }
    url += 'response_type=' + type + '&';
    url += 'client_id=' + encodeURIComponent(settings.clientId || '') + '&';
    const redirect = settings.redirectUrl || settings.redirectUri;
    if (redirect) {
      url += 'redirect_uri=' + encodeURIComponent(redirect) + '&';
    }
    if (settings.scopes && settings.scopes.length) {
      url += 'scope=' + this._computeScope(settings.scopes);
    }
    url += '&state=' + encodeURIComponent(this._state);
    if (settings.includeGrantedScopes) {
      url += '&include_granted_scopes=true';
    }
    if (settings.loginHint) {
      url += '&login_hint=' + encodeURIComponent(settings.loginHint);
    }
    if (settings.interactive === false) {
      url += '&prompt=none';
    }
    // custom query parameters
    if (settings.customData) {
      const key = type === 'token' ? 'auth' : 'token';
      const cs = settings.customData[key];
      if (cs) {
        url = this._applyCustomSettingsQuery(url, cs);
      }
    }
    return url;
  }
  /**
   * Applies custom properties defined in the OAuth settings object to the URL.
   *
   * @param {String} url Generated URL for an endpoint.
   * @param {?Object} data `customData.[type]` property from the settings
   * object. The type is either `auth` or `token`.
   * @return {String}
   */
  _applyCustomSettingsQuery(url, data) {
    if (!data || !data.parameters) {
      return url;
    }
    const char = url.indexOf('?') === -1 ? '?' : '&';
    url += char + data.parameters.map((item) => {
      let value = item.value;
      if (value) {
        value = encodeURIComponent(value);
      }
      return encodeURIComponent(item.name) + '=' + value;
    }).join('&');
    return url;
  }

  /**
   * Applies custom headers from the settings object
   *
   * @param {XMLHttpRequest} xhr Instance of the request object.
   * @param {Object} data Value of settings' `customData` property
   */
  _applyCustomSettingsHeaders(xhr, data) {
    if (!data || !data.token || !data.token.headers) {
      return;
    }
    data.token.headers.forEach((item) => {
      try {
        xhr.setRequestHeader(item.name, item.value);
      } catch (e) {
        console.warn('Unable to set custom header value.');
      }
    });
  }
  /**
   * Applies custom body properties from the settings to the body value.
   *
   * @param {String} body Already computed body for OAuth request. Custom
   * properties are appended at the end of OAuth string.
   * @param {Object} data Value of settings' `customData` property
   * @return {String} Request body
   */
  _applyCustomSettingsBody(body, data) {
    if (!data || !data.token || !data.token.body) {
      return body;
    }
    body += '&' + data.token.body.map(function(item) {
      let value = item.value;
      if (value) {
        value = encodeURIComponent(value);
      }
      return encodeURIComponent(item.name) + '=' + value;
    }).join('&');
    return body;
  }
  /**
   * Authorizes the user in the OAuth authorization endpoint.
   * By default it authorizes the user using a popup that displays
   * authorization screen.
   *
   * @param {String} authUrl Complete authorization url
   * @param {Object} settings Passed user settings
   */
  _authorize(authUrl, settings) {
    if (settings.interactive === false) {
      this._authorizeTokenNonInteractive(authUrl);
    } else {
      this._authorizePopup(authUrl);
    }
  }

  /**
   * Creates and opens auth popup.
   *
   * @param {String} url Complete authorization url
   */
  _authorizePopup(url) {
    this.addHandlers();
    this._initUrl = url;
    let op = 'menubar=no,location=no,resizable=yes,scrollbars=yes,';
    op += 'status=no,width=800,height=600';
    this._popup = window.open('about:blank', 'oauth-window', op);
    this._popup.window.focus();
  }

  /**
   * Tries to Authorize the user in a non interactive way.
   * This method always result in a success response. When there's an error or
   * user is not logged in then the response won't contain auth token info.
   *
   * @param {String} url Complete authorization url
   */
  _authorizeTokenNonInteractive(url) {
    const iframe = document.createElement('iframe');
    iframe.style.border = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.overflow = 'hidden';
    iframe.addEventListener('error', this._frameLoadErrorHandler);
    iframe.addEventListener('load', this._frameLoadHandler);
    iframe.id = 'oauth2-authorization-frame';
    iframe.setAttribute('data-owner', 'arc-oauth-authorization');
    document.body.appendChild(iframe);
    iframe.src = url;
    this._iframe = iframe;
  }
  /**
   * Handler for `error` event dispatched by oauth iframe.
   */
  _frameLoadErrorHandler() {
    if (this._errored) {
      return;
    }
    this._handleTokenInfo({
      interactive: false,
      code: 'iframe_load_error',
      state: this._state
    });
    this.clear();
  }
  /**
   * Handler for iframe `load` event.
   */
  _frameLoadHandler() {
    if (this.__frameLoadInfo) {
      return;
    }
    this.__frameLoadInfo = true;
    setTimeout(() => {
      if (!this.tokenInfo && !this._errored) {
        this._handleTokenInfo({
          interactive: false,
          code: 'not_authorized',
          state: this._state
        });
      }
      this.clear();
      this.__frameLoadInfo = false;
    }, 700);
  }

  /**
   * Removes the frame and any event listeners attached to it.
   */
  _cleanupFrame() {
    if (!this._iframe) {
      return;
    }
    this._iframe.removeEventListener('error', this._frameLoadErrorHandler);
    this._iframe.removeEventListener('load', this._frameLoadHandler);
    try {
      document.body.removeChild(this._iframe);
    } catch (e) {
      console.warn('Tried to remove a frame that is not in the DOM');
    }
    this._iframe = undefined;
  }

  /**
   * http://stackoverflow.com/a/10727155/1127848
   * @param {Number} len
   * @return {String}
   */
  randomString(len) {
    return Math.round((Math.pow(36, len + 1) - Math.random() *
      Math.pow(36, len))).toString(36).slice(1);
  }
  /**
   * Computes `scope` URL parameter from scopes array.
   *
   * @param {Array<String>} scopes List of scopes to use with the request.
   * @return {String} Computed scope value.
   */
  _computeScope(scopes) {
    if (!scopes) {
      return '';
    }
    const scope = scopes.join(' ');
    return encodeURIComponent(scope);
  }
  /**
   * Gets the token data from the URL
   *
   * @param {String} url
   * @return {Object} Map of OAuth2 parameters.
   */
  authDataFromUrl(url) {
    if (!url) {
      return;
    }
    const params = {
      tokenTime: Date.now()
    };
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substr(queryIndex + 1);
    } else {
      url = url.substr(url.indexOf('#') + 1);
    }
    url.split('&')
    .forEach((p) => {
      const item = p.split('=');
      const name = item[0];
      params[name] = decodeURIComponent(item[1]);
      const cameled = this._camel(name);
      if (cameled) {
        params[cameled] = params[name];
      }
    });
    return params;
  }
  /**
   * Called when the authorization data are set. This processes the response
   * dependeing on authorization type.
   * @param {Object} tokenInfo
   */
  processAuthResponse(tokenInfo) {
    if (!tokenInfo) {
      return;
    }
    if (!this._settings) {
      this._settings = {};
    }
    if (tokenInfo.state !== this._state) {
      this._dispatchError({
        message: 'Invalid state returned by the OAuth server.',
        code: 'invalid_state',
        state: this._state,
        serverState: tokenInfo.state,
        interactive: this._settings.interactive
      });
      this._errored = true;
    } else if ('error' in tokenInfo) {
      this._dispatchError({
        message: tokenInfo.errorDescription || 'The request is invalid.',
        code: tokenInfo.error || 'oauth_error',
        state: this._state,
        interactive: this._settings.interactive
      });
      this._errored = true;
    } else if (this._type === 'implicit') {
      this._handleTokenInfo(tokenInfo);
    } else if (this._type === 'authorization_code') {
      this._exchangeCodeValue = tokenInfo.code;
      this._exchangeCode(tokenInfo.code)
      .catch(() => {});
    }
    this.clear();
  }
  /**
   * Processes token info object when it's ready.
   * Sets `tokenInfo` property, notifies listeners about the response
   * and cleans up.
   *
   * @param {Object} tokenInfo Token info returned from the server.
   * @return {Object} The same tokenInfo, used for Promise return value.
   */
  _handleTokenInfo(tokenInfo) {
    if (this.finished) {
      return;
    }
    this.finished = true;
    tokenInfo.interactive = this._settings.interactive;
    if ('error' in tokenInfo) {
      this._dispatchError({
        message: tokenInfo.errorDescription || 'The request is invalid.',
        code: tokenInfo.error,
        state: this._state,
        interactive: this._settings.interactive
      });
    } else {
      this._resolver(tokenInfo);
      this.clear();
    }
    this._settings = undefined;
    this._exchangeCodeValue = undefined;
    return tokenInfo;
  }
  /**
   * Reports an error
   *
   * @param {Object} detail The detail object.
   */
  _dispatchError(detail) {
    this._resolver(detail);
  }

  /**
   * Exchanges code for token.
   *
   * @param {String} code Returned code from the authorization endpoint.
   * @return {Promise} Promise with token information.
   */
  _exchangeCode(code) {
    const url = this._settings.accessTokenUri || this.settings.accessTokenUrl;
    const body = this._getCodeEchangeBody(this._settings, code);
    return this._requestToken(url, body, this._settings)
    .then((tokenInfo) => this._handleTokenInfo(tokenInfo))
    .catch((cause) => this._handleTokenCodeError(cause));
  }
  /**
   * Returns a body value for the code exchange request.
   * @param {Object} settings Initial settings object.
   * @param {String} code Authorization code value returned by the authorization
   * server.
   * @return {String} Request body.
   */
  _getCodeEchangeBody(settings, code) {
    let url = 'grant_type=authorization_code';
    url += '&client_id=' + encodeURIComponent(settings.clientId);
    const redirect = settings.redirectUri || settings.redirectUrl;
    if (redirect) {
      url += '&redirect_uri=' + encodeURIComponent(redirect);
    }
    url += '&code=' + encodeURIComponent(code);
    if (settings.clientSecret) {
      url += '&client_secret=' + encodeURIComponent(settings.clientSecret);
    } else {
      url += '&client_secret=';
    }
    return url;
  }
  /**
   * Requests for token from the authorization server for `code`, `password`,
   * `client_credentials` and custom grant types.
   *
   * @param {String} url Base URI of the endpoint. Custom properties will be
   * applied to the final URL.
   * @param {String} body Generated body for given type. Custom properties will
   * be applied to the final body.
   * @param {Object} settings Settings object passed to the `authorize()`
   * function
   * @return {Promise} Promise resolved to the response string.
   */
  _requestToken(url, body, settings) {
    if (settings.customData) {
      const cs = settings.customData.token;
      if (cs) {
        url = this._applyCustomSettingsQuery(url, cs);
      }
      body = this._applyCustomSettingsBody(body, settings.customData);
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', (e) =>
        this._processTokenResponseHandler(e, resolve, reject));
      xhr.addEventListener('error', (e) =>
        this._processTokenResponseErrorHandler(e, reject));
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
      if (settings.customData) {
        this._applyCustomSettingsHeaders(xhr, settings.customData);
      }
      try {
        xhr.send(body);
      } catch (e) {
        reject(new Error('Client request error: ' + e.message));
      }
    });
  }

  /**
   * Handler for the code request load event.
   * Processes the response and either rejects the promise with an error
   * or resolves it to token info object.
   *
   * @param {Event} e XHR load event.
   * @param {Function} resolve Resolve function
   * @param {Function} reject Reject function
   */
  _processTokenResponseHandler(e, resolve, reject) {
    const status = e.target.status;
    const srvResponse = e.target.response;
    if (status === 404) {
      let message = 'Authorization URI is invalid. Received status 404.';
      reject(new Error(message));
      return;
    } else if (status >= 400 && status < 500) {
      let message = 'Client error: ' + srvResponse;
      reject(new Error(message));
      return;
    } else if (status >= 500) {
      let message = 'Authorization server error. Response code is ' + status;
      reject(new Error(message));
      return;
    }
    let tokenInfo;
    try {
      tokenInfo = this._processCodeResponse(srvResponse,
        e.target.getResponseHeader('content-type'));
    } catch (e) {
      reject(new Error(e.message));
      return;
    }
    resolve(tokenInfo);
  }
  /**
   * Handler for the code request error event.
   * Rejects the promise with error description.
   *
   * @param {Event} e XHR error event
   * @param {Function} reject Promise's reject function.
   */
  _processTokenResponseErrorHandler(e, reject) {
    const status = e.target.status;
    let message = 'The request to the authorization server failed.';
    if (status) {
      message += ' Response code is: ' + status;
    }
    reject(new Error(message));
  }
  /**
   * Processes token request body and produces map of values.
   *
   * @param {String} body Body received in the response.
   * @param {String} contentType Response content type.
   * @return {Object} Response as an object.
   * @throws {Error} Exception when body is invalid.
   */
  _processCodeResponse(body, contentType) {
    if (!body) {
      throw new Error('Code response body is empty.');
    }
    let tokenInfo;
    if (contentType.indexOf('json') !== -1) {
      tokenInfo = JSON.parse(body);
      Object.keys(tokenInfo).forEach((name) => {
        const camelName = this._camel(name);
        if (camelName) {
          tokenInfo[camelName] = tokenInfo[name];
        }
      });
    } else {
      tokenInfo = {};
      body.split('&').forEach((p) => {
        const item = p.split('=');
        const name = item[0];
        const camelName = this._camel(name);
        const value = decodeURIComponent(item[1]);
        tokenInfo[name] = value;
        tokenInfo[camelName] = value;
      });
    }
    return tokenInfo;
  }

  /**
   * Handler fore an error that happened during code exchange.
   * @param {Error} e
   */
  _handleTokenCodeError(e) {
    this._dispatchError({
      message: 'Couldn\'t connect to the server. ' + e.message,
      code: 'request_error',
      state: this._state,
      interactive: this._settings.interactive
    });
    this._settings = undefined;
    this.clear();
    throw e;
  }
  /**
   * Requests a token for `password` request type.
   *
   * @param {Object} settings The same settings as passed to `authorize()`
   * function.
   * @return {Promise} Promise resolved to token info.
   */
  authorizePassword(settings) {
    this._settings = settings;
    const url = settings.accessTokenUri;
    const body = this._getPasswordBody(settings);
    return this._requestToken(url, body, settings)
    .then((tokenInfo) => this._handleTokenInfo(tokenInfo))
    .catch((cause) => this._handleTokenCodeError(cause));
  }
  /**
   * Generates a payload message for password authorization.
   *
   * @param {Object} settings Settings object passed to the `authorize()`
   * function
   * @return {String} Message body as defined in OAuth2 spec.
   */
  _getPasswordBody(settings) {
    let url = 'grant_type=password';
    url += '&username=' + encodeURIComponent(settings.username);
    url += '&password=' + encodeURIComponent(settings.password);
    if (settings.clientId) {
      url += '&client_id=' + encodeURIComponent(settings.clientId);
    }
    if (settings.scopes && settings.scopes.length) {
      url += '&scope=' + encodeURIComponent(settings.scopes.join(' '));
    }
    return url;
  }
  /**
   * Requests a token for `client_credentials` request type.
   *
   * @param {Object} settings The same settings as passed to `authorize()`
   * function.
   * @return {Promise} Promise resolved to a token info object.
   */
  authorizeClientCredentials(settings) {
    this._settings = settings;
    const url = settings.accessTokenUri;
    const body = this._getClientCredentialsBody(settings);
    return this._requestToken(url, body, settings)
    .then((tokenInfo) => this._handleTokenInfo(tokenInfo))
    .catch((cause) => this._handleTokenCodeError(cause));
  }
  /**
   * Generates a payload message for client credentials.
   *
   * @param {Object} settings Settings object passed to the `authorize()`
   * function
   * @return {String} Message body as defined in OAuth2 spec.
   */
  _getClientCredentialsBody(settings) {
    let url = 'grant_type=client_credentials';
    if (settings.clientId) {
      url += '&client_id=' + encodeURIComponent(settings.clientId);
    }
    if (settings.clientSecret) {
      url += '&client_secret=' + encodeURIComponent(settings.clientSecret);
    }
    if (settings.scopes && settings.scopes.length) {
      url += '&scope=' + this._computeScope(settings.scopes);
    }
    return url;
  }
  /**
   * Performs authorization on custom grant type.
   * This extension is described in OAuth 2.0 spec.
   *
   * @param {Object} settings Settings object as for `authorize()` function.
   * @return {Promise} Promise resolved to a token info object.
   */
  authorizeCustomGrant(settings) {
    this._settings = settings;
    const url = settings.accessTokenUri;
    const body = this._getCustomGrantBody(settings);
    return this._requestToken(url, body, settings)
    .then((tokenInfo) => this._handleTokenInfo(tokenInfo))
    .catch((cause) => this._handleTokenCodeError(cause));
  }
  /**
   * Creates a body for custom gran type.
   * It does not assume any parameter to be required.
   * It applies all known OAuth 2.0 parameters and then custom parameters
   *
   * @param {Object} settings
   * @return {String} Request body.
   */
  _getCustomGrantBody(settings) {
    let url = 'grant_type=' + encodeURIComponent(settings.type);
    if (settings.clientId) {
      url += '&client_id=' + encodeURIComponent(settings.clientId);
    }
    if (settings.clientSecret) {
      url += '&client_secret=' + encodeURIComponent(settings.clientSecret);
    }
    if (settings.scopes && settings.scopes.length) {
      url += '&scope=' + this._computeScope(settings.scopes);
    }
    if (settings.redirectUri) {
      url += '&redirect_uri=' + encodeURIComponent(settings.redirectUri);
    }
    if (settings.clientSecret) {
      url += '&client_secret=' + encodeURIComponent(settings.clientSecret);
    }
    if (settings.username) {
      url += '&username=' + encodeURIComponent(settings.username);
    }
    if (settings.password) {
      url += '&password=' + encodeURIComponent(settings.password);
    }
    return url;
  }
  /**
   * Replaces `-` or `_` with camel case.
   * @param {String} name The string to process
   * @return {String|undefined} Camel cased string or `undefined` if not
   * transformed.
   */
  _camel(name) {
    let i = 0;
    let l;
    let changed = false;
    while ((l = name[i])) {
      if ((l === '_' || l === '-') && i + 1 < name.length) {
        name = name.substr(0, i) + name[i + 1].toUpperCase() +
          name.substr(i + 2);
        changed = true;
      }
      i++;
    }
    return changed ? name : undefined;
  }
}

/**
 * API console proxy extension logic.
 */
class ApiConsoleExtension {
  /**
   * @constructor
   */
  constructor() {
    this._active = {};
  }
  /**
   * Listens to the extension events.
   */
  listen() {
    /* global chrome */
    chrome.runtime.onMessage.addListener(this._onMessage.bind(this));
  }
  /**
   * A message handler from the content script page.
   * @param {Object} message
   * @param {Object} sender
   * @param {Function} sendResponse
   * @return {Boolean} Always true so the browser won't close the
   * communication port.
   */
  _onMessage(message, sender, sendResponse) {
    this.handleRequest(message, sendResponse);
    return true;
  }
  /**
   * Handles request from the content sc ript page.
   * @param {Object} message Message received from the content script.
   * @param {Function} sendResponse
   */
  handleRequest(message, sendResponse) {
    switch (message.payload) {
      case 'xhr-data':
        this.handleRequestProxy(message.data, sendResponse);
        break;
      case 'oauth2-data':
        this.handleOauthProxy(message.data, sendResponse);
        break;
      default:
        this._reportError(sendResponse, 'Unknown payload.', message.data.id);
    }
  }
  /**
   * Handles request proxy from the content script page.
   * @param {Object} data
   * @param {Function} sendResponse
   */
  handleRequestProxy(data, sendResponse) {
    const id = data.id;
    if (!id) {
      this._reportError(sendResponse, 'Missing "id" parameter');
      return;
    }
    const request = new ApiConsoleRequestProxy(data);
    this._active[data.id] = sendResponse;
    request.execute()
    .then((result) => this.sendRequestResponse(data.id, result));
  }
  /**
   * Sends response to a content script if it wasn't aborted.
   * @param {String} id
   * @param {Object} response
   */
  sendRequestResponse(id, response) {
    const clb = this._active[id];
    if (!clb) {
      return;
    }
    delete this._active[id];
    response.data.id = id;
    clb(response);
  }
  /**
   * Reports an error to the content page.
   *
   * @param {Function} clb Port callback function.
   * @param {String} message A message with error description.
   * @param {String} id A request ID.
   */
  _reportError(clb, message, id) {
    clb({
      id,
      message: message || 'The request is invalid.',
      code: 'invalid_request',
      error: true
    });
  }
  /**
   * Proxies OAuth2 token request.
   * @param {Object} data
   * @param {Function} sendResponse
   */
  handleOauthProxy(data, sendResponse) {
    const proxy = new ApiConsoleOauthProxy(data);
    proxy.authorize()
    .then((authData) => {
      sendResponse(authData);
      proxy.clear();
    })
    .catch((cause) => {
      proxy.clear();
      this._reportError(sendResponse,
        cause.message || 'The request is invalid.');
      });
  }
}
// For tests.
if (isExtension) {
  const proxy = new ApiConsoleExtension();
  proxy.listen();
} else if (isNode) {
  module.exports.ApiConsoleExtension = ApiConsoleExtension;
  module.exports.ApiConsoleRequestProxy = ApiConsoleRequestProxy;
  module.exports.ApiConsoleOauthProxy = ApiConsoleOauthProxy;
}
