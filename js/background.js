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

/**
 * The API console extension is a proxy for making CORS XHR requests for the API console.
 */
class ApiConsoleExtension {
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

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.payload !== 'xhr-data') {
    return;
  }
  var ext = new ApiConsoleExtension(message.data);
  ext.execute()
  .then((result) => sendResponse(result));

  return true;
});
