/** @typedef {import('./types').IApiConsoleHttpRequest} IApiConsoleHttpRequest */
/** @typedef {import('./types').IOAuth2Authorization} IOAuth2Authorization */
/** @typedef {import('./types').ITokenInfo} ITokenInfo */
/** @typedef {import('./types').IApiConsoleProxyError} IApiConsoleProxyError */

import { PayloadSerializer } from './proxy/PayloadSerializer.js';

/**
 * @fires apicproxyready - When the proxy was detected in the current browser. This is dispatched separately on the instance of this class and on the event target (bubbling)
 * @fires api-console-extension-installed - Deprecated. Do no use this event.
 */
export class ApiConsoleAppProxy extends EventTarget {
  get hasExtension() {
    return this._hasExtension;
  }

  /**
   *
   * @param {EventTarget=} eventTarget The node on which to listen to the API Console events. Defaults to `window`.
   */
  constructor(eventTarget = window) {
    super();
    /** @type EventTarget */
    this.eventTarget = eventTarget;
    this._hasExtension = false;

    this._activeRequests = {};

    this._messageHandler = this._messageHandler.bind(this);
    this._requestHandler = this._requestHandler.bind(this);
    this._oauthTokenHandler = this._oauthTokenHandler.bind(this);
    this._abortHandler = this._abortHandler.bind(this);
  }

  listen() {
    const { eventTarget } = this;
    window.addEventListener("message", this._messageHandler);
    eventTarget.addEventListener("api-request", this._requestHandler);
    eventTarget.addEventListener("abort-api-request", this._abortHandler);
    eventTarget.addEventListener(
      "oauth2-token-requested",
      this._oauthTokenHandler
    );
    this._notifyExtension();
  }

  unlisten() {
    const { eventTarget } = this;
    window.removeEventListener("message", this._messageHandler);
    eventTarget.removeEventListener("api-request", this._requestHandler);
    eventTarget.removeEventListener("abort-api-request", this._abortHandler);
    eventTarget.removeEventListener(
      "oauth2-token-requested",
      this._oauthTokenHandler
    );
  }

  /**
   * Posts message on a window object to request an event from the
   * extension if it is installed.
   */
  _notifyExtension() {
    window.postMessage(
      {
        payload: "api-console-extension-installed",
      },
      window.location.origin
    );
  }

  /**
   * A handler for the message event dispatched on window object.
   * This is used in communication with an extension.
   *
   * @param {MessageEvent} e
   * @private
   */
  _messageHandler(e) {
    if (e.source !== window || !e.data) {
      return;
    }
    const { data } = e;
    if (!data["api-console-extension"]) {
      return;
    }
    switch (data["api-console-payload"]) {
      case "init":
        this._extensionDetected();
        break;
      case "api-console-response":
        this._responseReady(data["api-console-data"]);
        break;
      case "api-console-oauth2-token-response":
        this._oauthTokenReady(data["api-console-data"]);
        break;
      default:
    }
  }

  /**
   * A handler for API console request event
   *
   * @param {CustomEvent} e
   */
  async _requestHandler(e) {
    if (!this.hasExtension) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    let payload;
    if (e.detail.payload) {
      payload = await PayloadSerializer.serialize(e.detail.payload);
    }
    const detail = /** @type IApiConsoleHttpRequest */ ({
      id: e.detail.id,
      url: e.detail.url,
      method: e.detail.method,
    });
    if (e.detail.headers) {
      detail.headers = e.detail.headers;
    }
    if (payload) {
      detail.payload = payload;
    }
    this._activeRequests[e.detail.id] = detail;
    window.postMessage(
      {
        payload: "api-console-request",
        detail,
      },
      window.location.origin
    );
  }

  /**
   * A handler for API console abort request handler.
   *
   * @param {CustomEvent} e
   */
  _abortHandler(e) {
    if (!this.hasExtension) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    // Without the entry it won't report the response back.
    delete this._activeRequests[e.detail.id];
  }

  /**
   * A handler for API console OAuth2 token request handler.
   *
   * @param {CustomEvent} e
   */
  _oauthTokenHandler(e) {
    if (!this.hasExtension) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.postMessage(
      {
        payload: "api-console-oauth2",
        detail: e.detail,
      },
      window.location.origin
    );
  }

  /**
   * Called when the api-console-extension is detected.
   */
  _extensionDetected() {
    this._hasExtension = true;
    // this event is deprecated and left for compatibility with v4-6.
    this.eventTarget.dispatchEvent(
      new Event("api-console-extension-installed", {
        bubbles: true,
        composed: true,
      })
    );
    // informs the parent application.
    this.dispatchEvent(new Event("apicproxyready"));
    // informs the API Console application.
    this.eventTarget.dispatchEvent(
      new Event("apicproxyready", {
        bubbles: true,
      })
    );
  }

  /**
   * A handler for the response notified by the extension.
   * @param {Object} data
   */
  _responseReady(data) {
    if (!this.hasExtension) {
      return;
    }
    const response = data;
    const request = this._activeRequests[response.id];
    if (!request) {
      // operation has been aborted
      return;
    }
    delete this._activeRequests[response.id];
    response.request = request;
    this.eventTarget.dispatchEvent(
      new CustomEvent("api-response", {
        bubbles: true,
        composed: true,
        detail: response,
      })
    );
  }

  /**
   * Handler for OAuth token response.
   * @param {ITokenInfo | IApiConsoleProxyError | undefined} data
   */
  _oauthTokenReady(data) {
    //
    // Note, data coming from the page are considered untrusted.
    //
    if (!data) {
      this.eventTarget.dispatchEvent(
        new CustomEvent("oauth2-error", {
          bubbles: true,
          composed: true,
          detail: {
            message: "No response has been recorded.",
            code: "no_response",
          },
        })
      );
      return;
    }
    const typedError = /** @type IApiConsoleProxyError */ (data);
    if (typedError.error) {
      const message =
        typeof typedError.message === "string"
          ? typedError.message
          : "No response has been recorded.";
      const code =
        typeof typedError.code === "string" ? typedError.code : "unknown_error";
      this.eventTarget.dispatchEvent(
        new CustomEvent("oauth2-error", {
          bubbles: true,
          composed: true,
          detail: {
            message,
            code,
          },
        })
      );
      return;
    }
    const typedToken = /** @type ITokenInfo */ (data);
    const state =
      typeof typedToken.state === "string" ? typedToken.state : undefined;
    const accessToken =
      typedToken.accessToken && typeof typedToken.accessToken === "string"
        ? typedToken.accessToken
        : undefined;
    const tokenType =
      typedToken.tokenType && typeof typedToken.tokenType === "string"
        ? typedToken.tokenType
        : undefined;
    const expiresIn =
      typedToken.expiresIn &&
      (typeof typedToken.expiresIn === "number" ||
        typeof typedToken.expiresIn === "string")
        ? Number(typedToken.expiresIn)
        : undefined;
    const scope = Array.isArray(typedToken.scope)
      ? typedToken.scope
      : undefined;
    this.eventTarget.dispatchEvent(
      new CustomEvent("oauth2-token-response", {
        bubbles: true,
        composed: true,
        detail: {
          state,
          accessToken,
          tokenType,
          expiresIn,
          scope,
        },
      })
    );
  }
}
