import { AuthorizationError, CodeError } from './AuthorizationError.js';
import { camel, generateCodeChallenge, randomString, sanityCheck } from './OAuthUtils.js';
import * as KnownGrants from './KnownGrants.js';
import { applyCustomSettingsBody, applyCustomSettingsHeaders, applyCustomSettingsQuery } from './CustomParameters.js';

/** @typedef {import('../types').IOAuth2Authorization} IOAuth2Authorization */
/** @typedef {import('../types').ITokenInfo} ITokenInfo */

/**
 * @type {Record<string, string>}
 */
export const grantResponseMapping = {
  implicit: 'token',
  authorization_code: 'code',
};

/**
 * Performs OAuth2 authentication for API Console.
 */
export class OAuth2Proxy {
  /**
   * @returns {IOAuth2Authorization} The authorization settings used to initialize this class.
   */
  get settings() {
    return this._settingsValue;
  }

  /**
   * @returns {string} The request state parameter. If the state is not passed with the configuration one is generated.
   */
  get state() {
    if (!this._stateValue) {
      this._stateValue = this.settings.state || randomString();
    }
    return this._stateValue;
  }

  /**
   * @param {IOAuth2Authorization} settings The authorization configuration.
   */
  constructor(settings) {
    if (!settings) {
      throw new TypeError('Expected one argument.');
    }
    /** @type IOAuth2Authorization */
    this._settingsValue = this._prepareSettings(settings);
    /** @type string | undefined */
    this._stateValue = undefined;
    /** @type string | undefined */
    this._codeVerifierValue = undefined;
    /** @type {{ id: number, tab: chrome.tabs.Tab } | undefined} */
    this._popupTabInfo = undefined;
    /** @type {(value: ITokenInfo) => void | undefined} */
    this._resolveFunction = undefined;
    /** @type {(reason?: Error) => void | undefined} */
    this._rejectFunction = undefined;
    /** 
     * This is set by the tab change listener.
     * When `true` then the tab response has been handled. Otherwise the close handler will report error.
     * @type {boolean} 
     */
    this._handlingPopupResponse = false;

    this._tabUpdatedHandler = this._tabUpdatedHandler.bind(this);
    this._tabClosedHandler = this._tabClosedHandler.bind(this);
  }

  /**
   * @param {IOAuth2Authorization} settings
   * @returns {IOAuth2Authorization} Processed settings
   * @private
   */
  _prepareSettings(settings) {
    const copy = { ...settings };
    Object.freeze(copy);
    return copy;
  }

  /**
   * A function that should be called before the authorization.
   * It checks configuration integrity, and performs some sanity checks 
   * like proper values of the request URIs.
   * @returns {void}
   */
   checkConfig() {
    // @todo(pawel): perform settings integrity tests.
    sanityCheck(this.settings);
  }

  /**
   * Performs the authorization.
   * @returns {Promise<ITokenInfo>} Promise resolved to the token info.
   */
  authorize() {
    return new Promise((resolve, reject) => {
      this._resolveFunction = resolve;
      this._rejectFunction = reject;
      this._authorize();
    });
  }

  /**
   * Reports authorization error back to the application.
   *
   * This operation clears the promise object.
   *
   * @param {string} message The message to report
   * @param {string} code Error code
   * @returns {void}
   * @private
   */
  _reportOAuthError(message, code) {
    if (!this._rejectFunction) {
      return;
    }
    const e = new AuthorizationError(
      message,
      code,
      this.state,
    );
    this._rejectFunction(e);
    this._rejectFunction = undefined;
    this._resolveFunction = undefined;
  }

  /**
   * Starts the authorization process.
   * @returns {void}
   * @private
   */
  _authorize() {
    const { settings } = this;
    switch (settings.grantType) {
      case KnownGrants.implicit:
      case KnownGrants.code:
        this._authorizeImplicitCode();
        break;
      case KnownGrants.clientCredentials:
        this._authorizeClientCredentials();
        break;
      case KnownGrants.password:
        this._authorizePassword();
        break;
      case KnownGrants.deviceCode:
        this._authorizeDeviceCode();
        break;
      case KnownGrants.jwtBearer:
        this._authorizeJwt();
        break;
      default:
        this._authorizeCustomGrant();
    }
  }

  /**
   * Starts the authorization flow for the `implicit` and `authorization_code` flows.
   * @returns {Promise<void>}
   * @private
   */
  async _authorizeImplicitCode() {
    try {
      const url = await this.constructPopupUrl();
      if (!url) {
        throw new Error(`Unable to construct the authorization URL.`);
      }
      this._authorizePopup(url);
    } catch (e) {
      this._rejectFunction(e);
      this._rejectFunction = undefined;
      this._resolveFunction = undefined;
    }
  }

  /**
   * Constructs the popup/iframe URL for the `implicit` or `authorization_code` grant types.
   * @returns {Promise<string | null>} Full URL for the endpoint.
   */
  async constructPopupUrl() {
    const url = await this.buildPopupUrlParams();
    if (!url) {
      return null;
    }
    return url.toString();
  }

  /**
   * @returns {Promise<URL | null>} The parameters to build popup URL.
   */
  async buildPopupUrlParams() {
    const { settings } = this;
    const type = (settings.responseType || grantResponseMapping[settings.grantType]);
    if (!type) {
      return null;
    }
    const url = new URL(settings.authorizationUri);
    url.searchParams.set('response_type', type);
    url.searchParams.set('client_id', settings.clientId);
    // Client secret cannot be ever exposed to the client (browser)!
    // if (settings.clientSecret) {
    //   url.searchParams.set('client_secret', settings.clientSecret);
    // }
    url.searchParams.set('state', this.state);
    if (settings.redirectUri) {
      url.searchParams.set('redirect_uri', settings.redirectUri);
    }
    const { scopes } = settings;
    if (Array.isArray(scopes) && scopes.length) {
      url.searchParams.set('scope', scopes.join(' '));
    }
    if (settings.includeGrantedScopes) {
      // this is Google specific
      url.searchParams.set('include_granted_scopes', 'true');
    }
    if (settings.loginHint) {
      // this is Google specific
      url.searchParams.set('login_hint', settings.loginHint);
    }
    if (settings.pkce && String(type).includes('code')) {
      this._codeVerifierValue = randomString();
      const challenge = await generateCodeChallenge(this._codeVerifierValue);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    // custom query parameters from the `api-authorization-method` component
    if (settings.customData) {
      const cs = settings.customData.auth;
      if (cs) {
        applyCustomSettingsQuery(url, cs);
      }
    }
    return url;
  }

  /**
   * Opens a popup to request authorization from the user.
   * @param {string} url The URL to open.
   * @returns {Promise<void>}
   */
  async _authorizePopup(url) {
    try {
      const tab = await chrome.tabs.create({
        active: true,
        url,
      });
      const { id } = tab;
      if (!id) {
        throw new Error('Unable to process authorization. Created an invalid tab.');
      }
      this._popupTabInfo = {
        id: id,
        tab: tab
      };
      this._addTabHandlers();
    } catch (e) {
      throw new AuthorizationError(
        e.message,
        'popup_blocked',
        this.state
      );
    }
  }

  /**
   * Adds a browser wide listener to tabs update/close events.
   * Sadly chrome does not allow setting these events for a single tab only
   * with included full permissions to the tab when the tab was created by the extension.
   * 
   * This is invoked only when a tab is opened by the `_authorizePopup()` function.
   * The listeners are removes right after the tab was closed.
   * 
   * @returns {void}
   * @private
   */
  _addTabHandlers() {
    chrome.tabs.onUpdated.addListener(this._tabUpdatedHandler);
    chrome.tabs.onRemoved.addListener(this._tabClosedHandler);
  }

  /**
   * @returns {void}
   * @private
   */
  _removeTabHandlers() {
    chrome.tabs.onUpdated.removeListener(this._tabUpdatedHandler);
    chrome.tabs.onRemoved.removeListener(this._tabClosedHandler);
  }

  /**
   * Checks the state of the tab when updated.
   * @param {number} tabId 
   * @param {chrome.tabs.TabChangeInfo} changeInfo 
   * @returns {void}
   * @private
   */
  _tabUpdatedHandler(tabId, changeInfo) {
    const { _popupTabInfo } = this;
    if (!_popupTabInfo) {
      // this should not happen, no way to get here.
      this._reportOAuthError('Invalid state. Received a tab event but did not expect it.', 'popup_error');
      this._removeTabHandlers();
      return;
    }
    if (_popupTabInfo.id !== tabId) {
      // not our popup.
      return;
    }
    const { url } = changeInfo;
    if (!url || !url.includes(this.settings.redirectUri)) {
      return;
    }
    this._handlingPopupResponse = true;
    chrome.tabs.remove(tabId);
    this._processPopupResponseUrl(url);
  }

  /**
   * A handler for a tab close handler.
   * It clean-up tab info and removes tab listeners when a tab created by the extension is closed.
   * 
   * @param {number} tabId 
   * @returns {void}
   * @private
   */
  _tabClosedHandler(tabId) {
    const { _popupTabInfo } = this;
    if (!_popupTabInfo || _popupTabInfo.id !== tabId) {
      return;
    }
    this._removeTabHandlers();
    this._popupTabInfo = undefined;
    if (this._handlingPopupResponse) {
      return;
    }
    this._reportOAuthError('No response has been recorded.', 'no_response');
  }

  /**
   * Processes the authentication redirect URL to search for the response.
   * 
   * @param {string} url The popup URL.
   * @private
   */
  _processPopupResponseUrl(url) {
    /** @type string */
    let raw;
    try {
      raw = this._authDataFromUrl(url);
      if (!raw) {
        throw new Error('');
      }
    } catch (e) {
      this._reportOAuthError('Invalid response from the authentication server. The redirect parameters are invalid.', 'popup_error');
      return;
    }

    /** @type URLSearchParams */
    let params;
    try {
      params = new URLSearchParams(raw);
    } catch (e) {
      this._reportOAuthError('Invalid response from the redirect page', 'popup_error');
      return;
    }
    if (this._validateTokenResponse(params)) {
      this.processTokenResponse(params);
    } else {
      // eslint-disable-next-line no-console
      console.warn('Unprocessable authorization response', raw);
    }
  }

  /**
   * Gets an auth data from the URL
   * @param {string=} url
   * @returns {string}
   * @private
   */
  _authDataFromUrl(url) {
    const parser = new URL(url);
    const search = parser.search.substring(1);
    if (search) {
      return search;
    }
    return parser.hash.substring(1);
  }

  /**
   * @param {URLSearchParams} params The instance of search params with the response from the auth dialog.
   * @returns {boolean} true when the params qualify as an authorization popup redirect response.
   * @private
   */
  _validateTokenResponse(params) {
    const oauthParams = [
      'state',
      'error',
      'access_token',
      'code',
    ];
    return oauthParams.some(name => params.has(name));
  }

  /**
   * Processes the response returned by the popup or the iframe.
   * 
   * @param {URLSearchParams} oauthParams
   * @returns {Promise<void>}
   * @private
   */
  async processTokenResponse(oauthParams) {
    const state = oauthParams.get('state');
    if (!state) {
      this._reportOAuthError('Server did not return the state parameter.', 'no_state');
      return;
    }
    if (state !== this.state) {
      // The authorization class (this) is created per token request so this can only have one state.
      // When the app requests for more tokens at the same time is should create multiple instances of this.
      this._reportOAuthError('The state value returned by the authorization server is invalid.', 'invalid_state');
      return;
    }
    if (oauthParams.has('error')) {
      const args = this._createTokenResponseError(oauthParams);
      this._reportOAuthError(args[0], args[1]);
      return;
    }
    const { grantType, responseType } = this.settings;
    if (grantType === 'implicit' || responseType === 'id_token') {
      this._handleTokenInfo(this._tokenInfoFromParams(oauthParams));
      return;
    }
    if (grantType === 'authorization_code') {
      const code = oauthParams.get('code');
      if (!code) {
        this._reportOAuthError('The authorization server did not returned the authorization code.', 'no_code');
        return;
      }
      this._codeValue = code;
      let tokenInfo;
      try {
        tokenInfo = await this.exchangeCode(code);
        tokenInfo.state = state;
      } catch (e) {
        this._handleTokenCodeError(/** @type Error */(e));
        return;
      }
      this._handleTokenInfo(tokenInfo);
      return;
    }

    this._reportOAuthError('The authorization process has an invalid state. This should never happen.', 'unknown_state');
  }

  /**
   * Processes the response returned by the popup or the iframe.
   * 
   * @param {URLSearchParams} oauthParams
   * @returns {string[]} Parameters for the `_reportOAuthError()` function
   * @private
   */
  _createTokenResponseError(oauthParams) {
    const code = oauthParams.get('error');
    const message = oauthParams.get('error_description');
    return this._createErrorParams(code, message);
  }

  /**
   * Creates arguments for the error function from error response
   * @param {string} code Returned from the authorization server error code
   * @param {string=} description Returned from the authorization server error description
   * @returns {string[]} Parameters for the `_reportOAuthError()` function
   * @private
   */
  _createErrorParams(code, description) {
    let message;
    if (description) {
      message = description;
    } else {
      switch (code) {
        case 'interaction_required':
          message = 'The request requires user interaction.';
          break;
        case 'invalid_request':
          message = 'The request is missing a required parameter.';
          break;
        case 'invalid_client':
          message = 'Client authentication failed.';
          break;
        case 'invalid_grant':
          message = 'The provided authorization grant or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.';
          break;
        case 'unauthorized_client':
          message = 'The authenticated client is not authorized to use this authorization grant type.';
          break;
        case 'unsupported_grant_type':
          message = 'The authorization grant type is not supported by the authorization server.';
          break;
        case 'invalid_scope':
          message = 'The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.';
          break;
        default:
          message = 'Unknown error';
      }
    }
    return [message, code];
  }

  /**
   * Creates a token info object from query parameters
   * 
   * @param {URLSearchParams} oauthParams
   * @returns {ITokenInfo}
   * @private
   */
  _tokenInfoFromParams(oauthParams) {
    const accessToken = oauthParams.get('access_token');
    const idToken = oauthParams.get('id_token');
    const refreshToken = oauthParams.get('refresh_token');
    const tokenType = oauthParams.get('token_type');
    const expiresIn = Number(oauthParams.get('expires_in'));
    const scope = this._computeTokenInfoScopes(oauthParams.get('scope'));
    const tokenInfo = /** @type ITokenInfo */ ({
      accessToken,
      idToken,
      refreshToken,
      tokenType,
      expiresIn,
      state: oauthParams.get('state'),
      scope,
      expiresAt: 0,
      expiresAssumed: false,
    });
    return this._computeExpires(tokenInfo);
  }

  /**
   * Processes token info object when it's ready.
   *
   * @param {ITokenInfo} info Token info returned from the server.
   * @returns {void}
   * @private
   */
  _handleTokenInfo(info) {
    this._tokenResponse = info;
    if (this._resolveFunction) {
      this._resolveFunction(info);
    }
    this._rejectFunction = undefined;
    this._resolveFunction = undefined;
  }

  /**
   * Computes token expiration time.
   * It sets `expires_at` property on the token info object which is the time
   * in the future when when the token expires.
   *
   * @param {ITokenInfo} tokenInfo Token info object
   * @returns {ITokenInfo} A copy with updated properties.
   * @private
   */
  _computeExpires(tokenInfo) {
    const copy = { ...tokenInfo };
    let { expiresIn } = copy;
    if (!expiresIn || Number.isNaN(expiresIn)) {
      expiresIn = 3600;
      copy.expiresAssumed = true;
    }
    copy.expiresIn = expiresIn;
    const expiresAt = Date.now() + (expiresIn * 1000);
    copy.expiresAt = expiresAt;
    return copy;
  }

  /**
   * Computes the final list of granted scopes.
   * It is a list of scopes received in the response or the list of requested scopes.
   * Because the user may change the list of scopes during the authorization process
   * the received list of scopes can be different than the one requested by the user.
   *
   * @param {string} scope The `scope` parameter received with the response. It's null safe.
   * @returns {string[]} The list of scopes for the token.
   * @private
   */
  _computeTokenInfoScopes(scope) {
    const requestedScopes = this.settings.scopes;
    if (!scope && requestedScopes) {
      return requestedScopes;
    }
    let listScopes = /** @type string[] */ ([]);
    if (scope) {
      listScopes = scope.split(' ');
    }
    return listScopes;
  }

  /**
   * Exchanges the authorization code for authorization token.
   *
   * @param {string} code Returned code from the authorization endpoint.
   * @returns {Promise<Record<string, any>>} The response from the server.
   */
  async getCodeInfo(code) {
    const body = this.getCodeRequestBody(code);
    const url = this.settings.accessTokenUri;
    return this.requestTokenInfo(url, body);
  }

  /**
   * Requests for token from the authorization server for `code`, `password`, `client_credentials` and custom grant types.
   *
   * @param {string} url Base URI of the endpoint. Custom properties will be applied to the final URL.
   * @param {string} body Generated body for given type. Custom properties will be applied to the final body.
   * @param {Record<string, string>=} optHeaders Optional headers to add to the request. Applied after custom data.
   * @returns {Promise<Record<string, any>>} Promise resolved to the response string.
   * @private
   */
  async requestTokenInfo(url, body, optHeaders) {
    const urlInstance = new URL(url);
    const { settings } = this;
    let headers = /** @type Record<string, string> */ ({
      'content-type': 'application/x-www-form-urlencoded',
    });
    if (settings.customData) {
      if (settings.customData.token) {
        applyCustomSettingsQuery(urlInstance, settings.customData.token);
      }
      body = applyCustomSettingsBody(body, settings.customData);
      headers = applyCustomSettingsHeaders(headers, settings.customData);
    }
    if (optHeaders) {
      headers = { ...headers, ...optHeaders };
    }
    const init = /** @type RequestInit */ ({
      headers,
      body,
      method: 'POST',
      cache: 'no-cache',
    });
    const authTokenUrl = urlInstance.toString();
    const response = await fetch(authTokenUrl, init);
    const { status } = response;
    if (status === 404) {
      throw new Error('Authorization URI is invalid. Received status 404.');
    }
    if (status >= 500) {
      throw new Error(`Authorization server error. Response code is: ${status}`)
    }
    let responseBody;
    try {
      responseBody = await response.text();
    } catch (e) {
      responseBody = 'No response has been recorded';
    }
    if (!responseBody) {
      throw new Error('Code response body is empty.');
    }
    if (status >= 400 && status < 500) {
      throw new Error(`Client error: ${responseBody}`)
    }

    const mime = response.headers.get('content-type') || '';
    return this.processCodeResponse(responseBody, mime);
  }

  /**
   * Processes body of the code exchange to a map of key value pairs.
   * 
   * @param {string} body
   * @param {string=} mime
   * @returns {Record<string, any>}
   * @private
   */
  processCodeResponse(body, mime) {
    let tokenInfo = /** @type Record<string, any> */ ({});
    if (mime.includes('json')) {
      const info = JSON.parse(body);
      Object.keys(info).forEach((key) => {
        let name = /** @type {string | undefined} */ (key);
        if (name.includes('_') || name.includes('-')) {
          name = camel(name);
        }
        if (name) {
          tokenInfo[name] = info[key];
        }
      });
    } else {
      tokenInfo = {};
      const params = new URLSearchParams(body);
      params.forEach((value, key) => {
        let name = /** @type {string | undefined} */ (key);
        if (key.includes('_') || key.includes('-')) {
          name = camel(key);
        }
        if (name) {
          tokenInfo[name] = value;
        }
      });
    }
    return tokenInfo;
  }

  /**
   * @param {Record<string, any>} info
   * @returns {ITokenInfo} The token info when the request was a success.
   * @private
   */
  mapCodeResponse(info) {
    if (info.error) {
      throw new CodeError(info.errorDescription, info.error);
    }
    const expiresIn = Number(info.expiresIn);
    const scope = this._computeTokenInfoScopes(info.scope);
    const result = /** @type ITokenInfo */ ({
      ...info,
      expiresIn,
      scope,
      expiresAt: 0,
      expiresAssumed: false,
    });
    return this._computeExpires(result);
  }

  /**
   * Exchanges the authorization code for authorization token.
   *
   * @param {string} code Returned code from the authorization endpoint.
   * @returns {Promise<ITokenInfo>} The token info when the request was a success.
   * @private
   */
  async exchangeCode(code) {
    const info = await this.getCodeInfo(code);
    return this.mapCodeResponse(info);
  }

  /**
   * Returns a body value for the code exchange request.
   * @param code {string} Authorization code value returned by the authorization server.
   * @returns {string} The request body.
   */
  getCodeRequestBody(code) {
    const { settings } = this;
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('client_id', settings.clientId);
    if (settings.redirectUri) {
      params.set('redirect_uri', settings.redirectUri);
    }
    params.set('code', code);
    if (settings.clientSecret) {
      params.set('client_secret', settings.clientSecret);
    } else {
      params.set('client_secret', '');
    }
    if (settings.pkce) {
      params.set('code_verifier', this._codeVerifierValue);
    }
    return params.toString();
  }

  /**
   * A handler for the error that happened during code exchange.
   * 
   * @param {Error} e
   * @returns {void}
   * @private
   */
  _handleTokenCodeError(e) {
    if (e instanceof CodeError) {
      // @ts-ignore
      this._reportOAuthError(...this._createErrorParams(e.code, e.message));
    } else {
      this._reportOAuthError(`Couldn't connect to the server. ${e.message}`, 'request_error');
    }
  }

  /**
   * Requests a token for `client_credentials` request type.
   * 
   * This method resolves the main promise set by the `authorize()` function.
   *
   * @return {Promise<void>} Promise resolved to a token info object.
   * @private
   */
  async _authorizeClientCredentials() {
    const { settings } = this;
    const { accessTokenUri, deliveryMethod = 'body', deliveryName = 'authorization' } = settings;
    const body = this.getClientCredentialsBody();
    /** @type Record<string, string> | undefined */
    let headers;
    const headerTransport = deliveryMethod === 'header';
    if (headerTransport) {
      headers = {
        [deliveryName]: this.getClientCredentialsHeader(settings),
      };
    }
    try {
      const info = await this.requestTokenInfo(accessTokenUri, body, headers);
      const tokenInfo = this.mapCodeResponse(info);
      this._handleTokenInfo(tokenInfo);
    } catch (cause) {
      this._handleTokenCodeError(cause);
    }
  }

  /**
   * Generates a payload message for client credentials.
   *
   * @returns {string} Message body as defined in OAuth2 spec.
   */
  getClientCredentialsBody() {
    const { settings } = this;
    const headerTransport = settings.deliveryMethod === 'header';
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    if (!headerTransport && settings.clientId) {
      params.set('client_id', settings.clientId);
    }
    if (!headerTransport && settings.clientSecret) {
      params.set('client_secret', settings.clientSecret);
    }
    if (Array.isArray(settings.scopes) && settings.scopes.length) {
      params.set('scope', settings.scopes.join(' '));
    }
    return params.toString();
  }

  /**
   * Builds the authorization header for Client Credentials grant type.
   * According to the spec the authorization header for this grant type
   * is the Base64 of `clientId` + `:` + `clientSecret`.
   * 
   * @param {IOAuth2Authorization} settings The OAuth 2 settings to use
   * @returns {string}
   */
  getClientCredentialsHeader(settings) {
    const { clientId = '', clientSecret = '' } = settings;
    const hash = btoa(`${clientId}:${clientSecret}`);
    return `Basic ${hash}`;
  }

  /**
   * Requests a token for `client_credentials` request type.
   * 
   * This method resolves the main promise set by the `authorize()` function.
   *
   * @returns {Promise<void>} Promise resolved to a token info object.
   * @private
   */
  async _authorizePassword() {
    const { settings } = this;
    const url = settings.accessTokenUri;
    const body = this.getPasswordBody();
    try {
      const info = await this.requestTokenInfo(url, body);
      const tokenInfo = this.mapCodeResponse(info);
      this._handleTokenInfo(tokenInfo);
    } catch (cause) {
      this._handleTokenCodeError(cause);
    }
  }

  /**
   * Generates a payload message for password authorization.
   *
   * @returns {string} Message body as defined in OAuth2 spec.
   */
  getPasswordBody() {
    const { settings } = this;
    const params = new URLSearchParams();
    params.set('grant_type', 'password');
    params.set('username', settings.username || '');
    params.set('password', settings.password || '');
    if (settings.clientId) {
      params.set('client_id', settings.clientId);
    }
    if (settings.clientSecret) {
      params.set('client_secret', settings.clientSecret);
    }
    if (Array.isArray(settings.scopes) && settings.scopes.length) {
      params.set('scope', settings.scopes.join(' '));
    }
    return params.toString();
  }

  /**
   * Performs authorization on custom grant type.
   * This extension is described in OAuth 2.0 spec.
   * 
   * This method resolves the main promise set by the `authorize()` function.
   *
   * @returns {Promise<void>} Promise resolved when the request finish.
   * @private
   */
  async _authorizeCustomGrant() {
    const { settings } = this;
    const url = settings.accessTokenUri;
    const body = this.getCustomGrantBody();
    try {
      const info = await this.requestTokenInfo(url, body);
      const tokenInfo = this.mapCodeResponse(info);
      this._handleTokenInfo(tokenInfo);
    } catch (cause) {
      this._handleTokenCodeError(cause);
    }
  }

  /**
   * Generates a payload message for the custom grant.
   *
   * @returns {string} Message body as defined in OAuth2 spec.
   */
  getCustomGrantBody() {
    const { settings } = this;
    const params = new URLSearchParams();
    params.set('grant_type', settings.grantType);
    if (settings.clientId) {
      params.set('client_id', settings.clientId);
    }
    if (settings.clientSecret) {
      params.set('client_secret', settings.clientSecret);
    }
    if (Array.isArray(settings.scopes) && settings.scopes.length) {
      params.set('scope', settings.scopes.join(' '));
    }
    if (settings.redirectUri) {
      params.set('redirect_uri', settings.redirectUri);
    }
    if (settings.username) {
      params.set('username', settings.username);
    }
    if (settings.password) {
      params.set('password', settings.password);
    }
    return params.toString();
  }

  /**
   * Requests a token for the `urn:ietf:params:oauth:grant-type:device_code` response type.
   *
   * @returns {Promise<void>} Promise resolved to a token info object.
   * @private
   */
  async _authorizeDeviceCode() {
    const { settings } = this;
    const url = settings.accessTokenUri;
    const body = this.getDeviceCodeBody();
    try {
      const info = await this.requestTokenInfo(url, body);
      const tokenInfo = this.mapCodeResponse(info);
      this._handleTokenInfo(tokenInfo);
    } catch (cause) {
      this._handleTokenCodeError(cause);
    }
  }

  /**
   * Generates a payload message for the `urn:ietf:params:oauth:grant-type:device_code` authorization.
   *
   * @returns {string} Message body as defined in OAuth2 spec.
   */
  getDeviceCodeBody() {
    const { settings } = this;
    const params = new URLSearchParams();
    params.set('grant_type', KnownGrants.deviceCode);
    params.set('device_code', settings.deviceCode || '');
    if (settings.clientId) {
      params.set('client_id', settings.clientId);
    }
    if (settings.clientSecret) {
      params.set('client_secret', settings.clientSecret);
    }
    return params.toString();
  }

  /**
   * Requests a token for the `urn:ietf:params:oauth:grant-type:jwt-bearer` response type.
   *
   * @returns {Promise<void>} Promise resolved to a token info object.
   * @private
   */
  async _authorizeJwt() {
    const { settings } = this;
    const url = settings.accessTokenUri;
    const body = this.getJwtBody();
    try {
      const info = await this.requestTokenInfo(url, body);
      const tokenInfo = this.mapCodeResponse(info);
      this._handleTokenInfo(tokenInfo);
    } catch (cause) {
      this._handleTokenCodeError(cause);
    }
  }

  /**
   * Generates a payload message for the `urn:ietf:params:oauth:grant-type:jwt-bearer` authorization.
   *
   * @return {string} Message body as defined in OAuth2 spec.
   */
  getJwtBody() {
    const { settings } = this;
    const params = new URLSearchParams();
    params.set('grant_type', KnownGrants.jwtBearer);
    params.set('assertion', settings.assertion || '');
    if (Array.isArray(settings.scopes) && settings.scopes.length) {
      params.set('scope', settings.scopes.join(' '));
    }
    return params.toString();
  }
}
