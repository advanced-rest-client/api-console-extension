# Extension's architecture

The extension proxies HTTP requests from the API Console application running in domain A to an API server the application is rendering the documentation for. This includes authorizing the user in the API using the OAuth2 protocol. To do so, the extensions injects a code into any page visited by the user to enable this support.

This document describes in details how this process looks like.

## Establishing communication

The extension injects the so called content script into every page visited by the user. The script registers an event listener on the `window` object for the `api-console-ready` event dispatched by API Console application. This event is dispatched by API Console when the application is initialized.

Because API Console can be initialized at any time, not only th the page load, the even listener is registered for the whole time the user has the page opened.

As a response to the `api-console-ready` event dispatched by API Console, the extensions sends the message to the API Console using the `window.postMessage()` function. The message has the following properties:

```json
{
  "api-console-payload": "init",
  "api-console-extension": true
}
```

The message is read by API Console and the application changes its internal state to proxy all request through the extension instead of using the web platform's Fetch.

## Proxying an HTTP request

When the communication between the extension and API Console was established, API Console starts sending HTTP requests through the proxy instead of the `fetch()` function. The application sends a message to the content script using the `window.postMessage()` function with the following content:

```json
{
  "api-console-request": "init",
  "detail": {
    "method": "HTTP method",
    "url": "API endpoint URL",
    "headers": "Optional, HTTP headers string",
    "payload": "Optional, the message, can be a string or a file",
    "files": "Optional, a serialized form data that is restored to the FormData object in the extension"
  }
}
```

The content of the message is send to the background page. The background page makes the HTTP request to the API and constructs the HTTP response object compatible with API Console. This object is passed back to the content script. When the content script receives the response, it sends the entire message to API console using the `window.postMessage()` function, with the following properties:

```json
{
  "api-console-payload": "api-console-response",
  "api-console-extension": true,
  "api-console-data": {
    "data": { ... },
    "log": [{ ... }]
  }
}
```

The `data` contains the response object recognized by API Console. The `log` has additional execution log information which can be rendered to the user when an error ocurred.

## Proxying OAuth2

The extension also allows to perform OAuth2 authorization before the HTTP request. This is part of the application regular flow.

The communication is similar to proxying HTTP requests but the extension opens a tab to perform authentication and reads the authorization server's redirect data. The data is reported back to the application.

Message from API Console:

```json
{
  "api-console-request": "oauth2",
  "detail": {
    ...
  }
}
```

Message to API Console:

```json
{
  "api-console-payload": "api-console-oauth2-token-response",
  "api-console-extension": true,
  "api-console-data": {
    "accessToken": "..."
  }
}
```
