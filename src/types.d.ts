interface IProxyMessage {
  'api-console-extension': true;
}

export interface IProxyMessageInit extends IProxyMessage {
  'api-console-payload': 'init';
}

export interface IProxyMessageHttpResponse extends IProxyMessage {
  'api-console-payload': 'api-console-response';
  'api-console-data': any;
}

export interface IProxyMessageOauth2Response extends IProxyMessage {
  'api-console-payload': 'api-console-oauth2-token-response';
  'api-console-data': any;
}

export interface IProxyMessageInternal {
  payload: 'fetch' | 'oauth2';
  data: IApiConsoleHttpRequest | IOAuth2Authorization;
}

export type DeserializedPayload = string | Blob | File | FormData | Buffer | ArrayBuffer | undefined;
export type PayloadTypes = 'string' | 'file' | 'blob' | 'formdata';

export interface IMultipartBody {
  /**
   * The name of the filed
   */
  name: string;
  /**
   * Converted value.
   * When the part value was a string this is a string.
   * When the previous value was a Blob or a Buffer, this will be a serialized payload.
   */
  value: ISafePayload;
}

/**
 * Represents a payload that is safe to store in a data store.
 * The `string` goes without any transformations.
 * The `file` and the `blob` are data URLs encoded as string.
 * The `buffer` and `arraybuffer` are UInt8Arrays.
 */
export interface ISafePayload {
  /**
   * The type od the originating payload object.
   */
  type: PayloadTypes;
  /**
   * The payload contents. The data type depends on the `type`.
   */
  data: string | number[] | IMultipartBody[];
  /**
   * Optionally the original mime type of the payload.
   * This is used with files.
   */
  meta?: IBlobMeta | IFileMeta;
}

export interface IBlobMeta {
  /**
   * The blob's mime type.
   */
  mime: string;
}

export interface IFileMeta extends IBlobMeta {
  /**
   * The file name.
   */
  name: string;
}

export interface RawValue {
  name: string;
  value: string;
}

export interface IApiConsoleHttpRequest {
  method: string;
  url: string;
  id: string;
  headers?: string;
  payload?: string | ISafePayload;
}

export interface IApiConsoleHttpResponse {
  responseData: IApiConsoleHttpResponseData | IApiConsoleProxyError;
  stats: IApiConsoleHttpResponseStats;
  id: string;
  request: IApiConsoleHttpRequest;
}

export interface IApiConsoleHttpResponseData {
  response: string;
  responseText: string;
  responseType: string;
  responseURL: string;
  status: number,
  statusText?: string;
  readyState?: number;
  headers?: string;
}

export interface IApiConsoleProxyError {
  error: true;
  code?: string;
  message: string;
}

export interface IApiConsoleHttpResponseStats {
  loadingTime: number;
  startTime: number;
}

export interface IApiConsoleProxyResponse {
  data: IApiConsoleProxyResponse;
}

export type OAuth2DeliveryMethod = 'header' | 'query' | 'body';

declare interface IBaseOAuth2Authorization {
  /**
   * List of scopes to be used with the token request.
   * This parameter is not required per OAuth2 spec.
   */
  scopes?: string[];
}

/**
 * OAuth 2 configuration object used in the API Client and API Components.
 */
export interface IOAuth2Authorization extends IBaseOAuth2Authorization {
  /**
   * The grant type of the OAuth 2 flow.
   *
   * Can be:
   * - implicit - deprecated and legacy
   * - authorization_code
   * - password - deprecated and legacy
   * - client_credentials
   * - refresh_token
   * - any custom grant supported by the authorization server
   */
  grantType?: 'implicit' | 'authorization_code' | 'password' | 'client_credentials' | 'refresh_token' | string;
  /**
   * Optional value to set on the `response_type` parameter.
   */
  responseType?: string;
  /**
   * The client ID registered in the OAuth2 provider.
   */
  clientId?: string;
  /**
   * The client ID registered in the OAuth2 provider.
   * This value is not required for select grant types.
   */
  clientSecret?: string;
  /**
   * The user authorization URI as defined by the authorization server.
   * This is required for the `implicit` and `authorization_code` grant types
   */
  authorizationUri?: string;
  /**
   * The token request URI as defined by the authorization server.
   * This is not required for the `implicit` grant type
   */
  accessTokenUri?: string;
  /**
   * The user redirect URI as configured in the authorization server.
   * This is required for the `implicit` and `authorization_code` grant types.
   */
  redirectUri?: string;
  /**
   * Required for the `password` grant type
   */
  username?: string;
  /**
   * Required for the `password` grant type
   */
  password?: string;
  /**
   * The state parameter as defined in the OAuth2 spec.
   * The state is returned back with the token response.
   */
  state?: string;
  /**
   * Additional data defined outside the scope of the OAuth2 protocol to be set
   * on both authorization and token requests.
   */
  customData?: IOAuth2CustomData;
  /**
   * This is not a standard OAuth 2 parameter.
   * Used by Google's oauth 2 server to include already granted to this app
   * scopes to the list of this scopes.
   */
  includeGrantedScopes?: boolean;
  /**
   * This is not a standard OAuth 2 parameter.
   * Used by Google's oauth 2 server. It's the user email, when known.
   */
  loginHint?: string;
  /**
   * When set the `authorization_code` will use the PKCE extension of the OAuth2 
   * to perform the authorization. Default to `false`.
   * This is only relevant when the `authorization_code` grant type is used.
   */
  pkce?: boolean;
  /**
   * The access token type. Default to `Bearer`
   */
  tokenType?: string;
  /**
   * The last access token received from the authorization server. 
   * This is optional and indicates that the token has been already received.
   * This property should not be stored anywhere.
   */
  accessToken?: string;
  /**
   * Informs about what filed of the authenticated request the token property should be set.
   * By default the value is `header` which corresponds to the `authorization` by default,
   * but it is configured by the `deliveryName` property.
   * 
   * This can be used by the AMF model when the API spec defines where the access token should be
   * put in the authenticated request.
   * 
   * @default header
   */
  deliveryMethod?: OAuth2DeliveryMethod;

  /**
   * The name of the authenticated request property that carries the token.
   * By default it is `authorization` which corresponds to `header` value of the `deliveryMethod` property.
   * 
   * By setting both `deliveryMethod` and `deliveryName` you instruct the application (assuming it reads this values)
   * where to put the authorization token.
   * 
   * @default authorization
   */
  deliveryName?: string;
  /** 
   * The assertion parameter for the JWT token authorization.
   * 
   * @link https://datatracker.ietf.org/doc/html/rfc7523#section-2.1
   */
  assertion?: string;
  /** 
   * The device_code parameter for the device code authorization.
   * 
   * @link https://datatracker.ietf.org/doc/html/rfc8628#section-3.4
   */
  deviceCode?: string;
}

export declare interface IOAuth2CustomParameter {
  /**
   * The name of the parameter
   */
  name: string;
  /**
   * The value of the parameter. It is ALWAYS a string.
   */
  value: string;
}

export interface IOAuth2TokenRequestCustomData {
  /**
   * The query parameters to use with the token request
   */
  parameters?: IOAuth2CustomParameter[];
  /**
   * The headers to use with the token request
   */
  headers?: IOAuth2CustomParameter[];
  /**
   * The body parameters to use with the token request.
   * This is x-www-urlencoded parameters to be added to the message.
   */
  body?: IOAuth2CustomParameter[];
}

export interface IOAuth2AuthorizationRequestCustomData {
  /**
   * The query parameters to add to the authorization URI
   */
  parameters?: IOAuth2CustomParameter[];
}

export interface IOAuth2CustomData {
  /**
   * The custom data to set on the authorization URI when opening the auth popup.
   */
  auth?: IOAuth2AuthorizationRequestCustomData;
  /**
   * The custom data to be set on the token request.
   */
  token?: IOAuth2TokenRequestCustomData;
}

declare interface ITokenBase {
  /**
   * The request state parameter, if used with the request.
   */
  state: string;
}

/**
 * OAuth 2 token response object.
 */
export interface ITokenInfo extends ITokenBase {
  /**
   * The access token.
   */
  accessToken: string;
  /**
   * The access token type.
   */
  tokenType?: string;
  /**
   * Access token expiration timeout.
   */
  expiresIn: number;
  /**
   * Access token expiration timestamp
   */
  expiresAt: number;
  /**
   * When `true` the `expires_in` and `expires_at` are assumed values (1 hour).
   */
  expiresAssumed?: boolean;
  /**
   * The list of scopes the token has been granted
   */
  scope?: string[];
  /**
   * The refresh token, when requested
   */
  refreshToken?: string;
}
