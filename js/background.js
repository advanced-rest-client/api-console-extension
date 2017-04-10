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

var isNode = !!(typeof module !== 'undefined' && module.exports);
var isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage);

/**
 * A proxy class for making CORS XHR requests for the API console.
 */
class ApiConsoleRequestProxy {
  constructor(request) {
    // HTTP mthod
    this.method = request.method;
    // Request URL
    this.url = request.url;
    // Request headers
    this.headers = request.headers;
    // Request body
    this.payload = request.payload;
    // Request files data
    this.files = request.files;
    // Log messages
    this.log = [];
    // The promise resolver. This can only resolve event when error.
    this.resolve = undefined;
    // Request start time
    this.startTime = 0;
    this._onload = this._loadHandler.bind(this);
    this._onerror = this._errorHandler.bind(this);
  }

  execute() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.startDate = Date.now();
      this._makeRequest();
    });
  }

  _makeRequest() {
    var xhr = new XMLHttpRequest();
    try {
      xhr.open(this.method, this.url, true);
    } catch (e) {
      this._errorHandler(e);
      return;
    }

    this.setHeaders(this.headers, xhr);
    xhr.addEventListener('load', this._onload);
    xhr.addEventListener('error', this._onerror);
    xhr.addEventListener('timeout', this._onerror);
    var data = this.getPayload();

    try {
      this.startTime = window.performance.now();
      xhr.send(data);
    } catch (e) {
      this._errorHandler(e);
      return;
    }
  }
  /**
   * Sets the request headers to the request object.
   *
   * @param {String} headers The headers to set as a HTTP headers string
   * @param {XMLHttpRequest} xhr The XMLHttpRequest object.
   */
  setHeaders(headers, xhr) {
    if (!headers) {
      return;
    }
    headers.split('\n').forEach((header) => {
      let data = header.split(':');
      let name = data[0].trim();
      let value = '';
      if (data[1]) {
        value = data[1].trim();
      }
      try {
        xhr.setRequestHeader(name, value);
      } catch (e) {
        this.log.push(`Can't set header ${name} in the XHR call.`);
      }
    });
  }

  getPayload() {
    if (['get', 'head'].indexOf(this.method.toLowerCase()) !== -1) {
      return;
    }
    if (this.files && this.files.length) {
      let fd = new FormData();
      let list;
      try {
        list = PayloadParser.parseString(this.payload);
      } catch (e) {
        this.log.push('Error parsing payload to form data values. ' + e.message);
      }
      if (list && list.length) {
        list.forEach((i) => fd.append(i.name, i.value));
      }
      this.files.forEach((f) => {
        let files = f.files;
        for (let i = 0, len = files.length; i < len; i++) {
          let file = new Blob([atob(files[i].file)],  {type: files[i].mime, encoding: 'utf-8'});
          fd.append(f.name, file);
        }
      });
      return fd;
    }
    return this.payload;
  }

  _errorHandler(e) {
    var loadTime = window.performance.now() - this.startTime;
    let result = {
      responseData: {
        error: true,
        message: e.message || 'Network error.'
      },
      stats: {
        loadingTime: loadTime,
        startTime: this.startDate
      }
    };
    this.publishResult(result);
  }

  _loadHandler(e) {
    var loadTime = window.performance.now() - this.startTime;
    var t = e.target;
    // The API console expects the Request and Response objects. However they are can't
    // be transfered to content script so the objects must be constructed on the API console app
    // by the supporting element. They can't be transfered by the `postMessage` function too.
    var result = {
      responseData: {
        response: t.response,
        responseText: t.responseText,
        responseType: t.responseType,
        responseURL: t.responseURL,
        status: t.status,
        statusText: t.statusText,
        readyState: t.readyState,
        headers: t.getAllResponseHeaders()
      },
      stats: {
        loadingTime: loadTime,
        startTime: this.startDate
      }
    };

    this.publishResult(result);
  }

  publishResult(result) {
    var messgae = {
      data: result,
      log: this.log
    };
    this.resolve(messgae);
  }
}
/**
 * Gets a OAuth token using Chrome's APIs
 */
class ApiConsoleOauthProxy {
  constructor(settings) {
    this.settings = settings;
    this._tokenInfo = undefined;
    this._tabUpdatedHandler = this._tabUpdated.bind(this);
    this._tabClosedHandler = this._tabClosed.bind(this);
    this._popupTabInfo = undefined;
  }

  addHandlers() {
    chrome.tabs.onUpdated.addListener(this._tabUpdatedHandler);
    chrome.tabs.onRemoved.addListener(this._tabClosedHandler);
  }

  removeHandlers() {
    chrome.tabs.onUpdated.removeListener(this._tabUpdatedHandler);
    chrome.tabs.onRemoved.removeListener(this._tabClosedHandler);
  }

  _tabUpdated(tabId, changeInfo, tab) {
    if (this._popupTabInfo) {
      if (this._popupTabInfo.tabId !== tabId) {
        return;
      }
      if (changeInfo.url && changeInfo.url.indexOf(this.settings.redirectUrl) !== -1) {
        this._handlingPopupResponse = true;
        let authData = this.authDataFromUrl(changeInfo.url);
        this.processAuthResponse(authData);
        chrome.tabs.remove(tabId);
      }
    } else {
      if (changeInfo.url && changeInfo.url === 'about:blank') {
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

  _tabClosed(tabId) {
    if (!this._popupTabInfo || this._popupTabInfo.tabId !== tabId) {
      return;
    }
    if (this._handlingPopupResponse) {
      return;
    }
    this._finish({
      'message': 'No response has been recorded.',
      'code': 'no_response',
      'error': true
    });
  }

  authorize() {
    this.addHandlers();
    return new Promise((resolve, reject) => {
      this._resolver = resolve;
      var settings = this.settings;
      this._type = settings.type;
      switch (settings.type) {
        case 'implicit':
          this._authorizeToken(settings);
          break;
        case 'authorization_code':
          this._authorizeCode(settings);
          break;
        case 'client_credentials':
          this._authorizeClientCredential(settings);
          break;
        case 'password':
          this._authorizePassword(settings);
          break;
        default:
          reject(new Error('Unknown authorization method ' + settings.type));
      }
    });
  }

  // Authorize the user in the browser flow.
  _authorizeToken() {
    this._initUrl = this._constructPopupUrl('token');
    var op = 'menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=800,height=600';
    this._popup = window.open('about:blank', 'oauth-window', op);
    this._popup.window.focus();
  }

  // Authorize the user in the browser flow.
  _authorizeCode() {
    this._initUrl = this._constructPopupUrl('code');
    var op = 'menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=800,height=600';
    this._popup = window.open('about:blank', 'oauth-window-code', op);
    this._popup.window.focus();
  }

  _constructPopupUrl(type) {
    var settings = this.settings;
    this._state = this.randomString(6);
    var url = settings.authorizationUrl + '?response_type=' + type + '&';
    url += 'client_id=' + encodeURIComponent(settings.clientId) + '&';
    if (settings.redirectUrl) {
      url += 'redirect_uri=' + encodeURIComponent(settings.redirectUrl) + '&';
    }
    url += 'scope=' + encodeURIComponent(settings.scopes.join(' '));
    url += '&state=' + encodeURIComponent(this._state);
    return url;
  }

  // http://stackoverflow.com/a/10727155/1127848
  randomString(len) {
    return Math.round((Math.pow(36, len + 1) - Math.random() * Math.pow(36, len)))
      .toString(36).slice(1);
  }
  /**
   * Gets an auth data from the URL
   */
  authDataFromUrl(url) {
    if (!url) {
      return;
    }
    var params = {
      'tokenTime': Date.now()
    };
    var queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substr(queryIndex + 1);
    } else {
      url = url.substr(url.indexOf('#') + 1);
    }
    url.split('&').forEach(function(p) {
      var item = p.split('=');
      var name = item[0];
      var origName = name;
      var i = 0;
      var l;
      while ((l = name[i])) {
        if ((l === '_' || l === '-') && i + 1 < name.length) {
          name = name.substr(0, i) + name[i + 1].toUpperCase() + name.substr(i + 2);
        }
        i++;
      }
      params[name] = decodeURIComponent(item[1]);
      params[origName] = decodeURIComponent(item[1]);
    });
    return params;
  }

  processAuthResponse(tokenInfo) {
    if (!tokenInfo) {
      return;
    }
    if (tokenInfo.state !== this._state) {
      return this._finish({
        'message': 'Invalid state returned by the oauth server.',
        'code': 'invalid_state',
        'error': true
      });
    }
    if ('error' in tokenInfo) {
      return this._finish({
        'message': tokenInfo.errorDescription || 'The request is invalid.',
        'code': tokenInfo.error,
        'error': true
      });
    }
    if (this.settings.type === 'implicit') {
      return this._finish(tokenInfo);
    }
    if (this.settings.type === 'authorization_code') {
      this._exchangeCodeValue = tokenInfo.code;
      this._exchangeCode(tokenInfo.code);
    }
  }

  _finish(response) {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.removeHandlers();
    this._resolver(response);
  }

  /**
   * Exchange code for token.
   * One note here. This element is intened to use with applications that test endpoints.
   * It asks user to provide `client_secret` parameter and it is not a security concern to him.
   * However, this method **can't be used in regular web applications** because it is a
   * security risk and whole OAuth token exchange can be compromised. Secrets should never be
   * present on client side.
   *
   * @param {String} code Returned code from the authorization endpoint.
   */
  _exchangeCode(code) {
    var url = this.settings.accessTokenUrl;
    var body = this._getCodeEchangeBody(this.settings, code);
    this._tokenCodeRequest(url, body);
  }

  _getCodeEchangeBody(settings, code) {
    var url = 'grant_type=authorization_code&';
    url += 'client_id=' + encodeURIComponent(settings.clientId) + '&';
    if (settings.redirectUrl) {
      url += 'redirect_uri=' + encodeURIComponent(settings.redirectUrl) + '&';
    }
    url += 'code=' + encodeURIComponent(code) + '&';
    url += 'client_secret=' + settings.clientSecret;
    return url;
  }

  _tokenCodeRequest(url, body) {
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', (e) => {
      try {
        this._handleTokenCodeResponse(e.target.response,
          e.target.getResponseHeader('content-type'));
      } catch (e) {
        return this._finish({
          'message': e.message || 'App error while decoding the token.',
          'code': 0,
          'error': true
        });
      }
    });
    xhr.addEventListener('error', this._handleTokenCodeError.bind(this));
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send(body);
  }

  // Decode token information from the response body.
  _handleTokenCodeResponse(data, contentType) {
    var tokenInfo;
    if (contentType.indexOf('json') !== -1) {
      try {
        tokenInfo = JSON.parse(data);
        for (var name in tokenInfo) {
          var camelName = this._camel(name);
          if (camelName) {
            tokenInfo[camelName] = tokenInfo[name];
          }
        }
      } catch (e) {
        return this._finish({
          'message': 'The response could not be parsed. ' + e.message,
          'code': 'response_parse',
          'error': true
        });
      }
    } else {
      tokenInfo = {};
      data.split('&').forEach(function(p) {
        var item = p.split('=');
        var name = item[0];
        var camelName = this._camel(name);
        var value = decodeURIComponent(item[1]);
        tokenInfo[name] = value;
        tokenInfo[camelName] = value;
      }, this);
    }

    if ('error' in tokenInfo) {
      return this._finish({
        'message': tokenInfo.errorDescription || 'The request is invalid.',
        'code': tokenInfo.error,
        'error': true
      });
    }
    this._finish(tokenInfo);
  }

  _handleTokenCodeError(e) {
    this._finish({
      'message': 'Couldn\'t connect to the server. ' + e.message,
      'code': 'request_error',
      'error': true
    });
  }

  _camel(name) {
    var i = 0;
    var l;
    var changed = false;
    while ((l = name[i])) {
      if ((l === '_' || l === '-') && i + 1 < name.length) {
        name = name.substr(0, i) + name[i + 1].toUpperCase() + name.substr(i + 2);
        changed = true;
      }
      i++;
    }
    return changed ? name : undefined;
  }

  _authorizePassword(settings) {
    var url = this.settings.accessTokenUrl;
    var body = this._getPasswordBody(settings);
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', (e) => {
      try {
        this._handleTokenCodeResponse(e.target.response,
          e.target.getResponseHeader('content-type'));
      } catch (e) {
        return this._finish({
          'message': e.message || 'App error while decoding the token.',
          'code': 0,
          'error': true
        });
      }
    });
    xhr.addEventListener('error', this._handleTokenCodeError.bind(this));
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send(body);
  }

  _getPasswordBody(settings) {
    var url = 'grant_type=password';
    url += '&username=' + encodeURIComponent(settings.username);
    url += '&password=' + encodeURIComponent(settings.password);
    if (settings.clientId) {
      url += '&client_id=' + encodeURIComponent(settings.clientId);
    }
    if (settings.scopes && settings.scopes.length) {
      url += 'scope=' + encodeURIComponent(settings.scopes.join(' '));
    }
    return url;
  }

  _authorizeClientCredential(settings) {
    var url = settings.accessTokenUrl;
    var body = this._getClientCredentialBody(settings);
    var xhr = new XMLHttpRequest();
    xhr.addEventListener('load', (e) => {
      try {
        this._handleTokenCodeResponse(e.target.response,
          e.target.getResponseHeader('content-type'));
      } catch (e) {
        return this._finish({
          'message': e.message || 'App error while decoding the token.',
          'code': 0,
          'error': true
        });
      }
    });
    xhr.addEventListener('error', this._handleTokenCodeError.bind(this));
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send(body);
  }

  _getClientCredentialBody(settings) {
    var url = 'grant_type=client_credentials';
    if (settings.clientId) {
      url += '&client_id=' + encodeURIComponent(settings.clientId);
    }
    if (settings.clientSecret) {
      url += '&client_secret=' + settings.clientSecret;
    }
    if (settings.scopes && settings.scopes.length) {
      url += 'scope=' + encodeURIComponent(settings.scopes.join(' '));
    }
    return url;
  }
}

/**
 * The API console extension is a proxy for making CORS XHR requests for the API console.
 */
class ApiConsoleExtension {
  constructor(sendResponseFunction) {
    this.sendResponse = sendResponseFunction;
  }

  handleRequest(message) {
    switch (message.payload) {
      case 'xhr-data': this.handleRequestProxy(message); break;
      case 'oauth2-data': this.handleOauth(message); break;
      default:
        this.sendMessage({
          error: true,
          message: 'Unknown payload.'
        });
    }
  }

  handleRequestProxy(message) {
    let ext = new ApiConsoleRequestProxy(message.data);
    ext.execute()
    .then((result) => this.sendResponse(result));
  }

  handleOauth(message) {
    var proxy = new ApiConsoleOauthProxy(message.data);
    proxy.authorize()
    .then((authData) => this.sendResponse(authData))
    .catch((cause) => {
      this.sendResponse({
        'message': cause.message || 'The request is invalid.',
        'code': 'invalid_request',
        'error': true
      });
    });
  }
}
// For tests.
if (isExtension) {
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    var handler = new ApiConsoleExtension(sendResponse);
    handler.handleRequest(message);
    return true;
  });
} else if (isNode) {
  module.exports.ApiConsoleExtension = ApiConsoleExtension;
  module.exports.ApiConsoleRequestProxy = ApiConsoleRequestProxy;
  module.exports.ApiConsoleOauthProxy = ApiConsoleOauthProxy;
}
