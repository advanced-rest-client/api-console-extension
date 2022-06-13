import { ApiConsoleAppProxy } from '../index.js';

let proxyId = 0;

class DemoPage {
  proxy = new ApiConsoleAppProxy();

  get installed() {
    return this._installed || false;
  }

  set installed(value) {
    const old = this._installed;
    if (old === value) {
      return;
    }
    this._installed = value;
    const node = document.getElementById('status');
    node.classList.remove('missing');
    node.classList.add('detected');
    node.innerText = 'The extension was detected.';
    document.getElementById('request').removeAttribute('hidden');
  }

  initialize() {
    this.proxy.addEventListener('apicproxyready', () => {
      this.installed = true;
    });
    this.proxy.listen();
    window.addEventListener('api-response', this._responseHandler);
    document.getElementById('request').addEventListener('submit', this._requestSubmit.bind(this));
  }

  /**
   * @param {SubmitEvent} e 
   */
  _requestSubmit(e) {
    e.preventDefault();
    const form = /** @type HTMLFormElement */ (e.target);
    const { elements } = form;
    const request = {};
    for (let i = 0; i < elements.length; i++) {
      const input = /** @type HTMLInputElement */ (elements[i]);
      if (input.name && input.value) {
        request[input.name] = input.value;
      }
    }
    const id = ++proxyId;
    request.id = id;
    document.body.dispatchEvent(new CustomEvent('api-request', {
      bubbles: true,
      cancelable: true,
      detail: request,
    }));
  }

  /**
   * 
   * @param {CustomEvent} e 
   */
  _responseHandler(e) {
    console.log(e.detail);
    const out = document.getElementById('requestResult');
    out.innerText = JSON.stringify(e.detail, null, 2);
    out.removeAttribute('hidden');
  }
}

const page = new DemoPage();
page.initialize();
