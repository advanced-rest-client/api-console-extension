# API Console extension

API Console extension to proxy HTTP requests to the documented API.

Install it from [Chrome Web Store](https://chrome.google.com/webstore/detail/olkpohecoakpkpinafnpppponcfojioa)

This extension allows to make HTTP requests through a browser proxy avoiding issues with CORS.

This repository also contains the `ApiConsoleAppProxy` library that is to be used with API Console application to initialize the communication with the extension and proxy HTTP requests.

## Permissions explained

### Access to your data in all websites

It is required to actually make HTTP requests to API endpoints. This means that the extension can make an HTTP request to any endpoint.

### Access to tabs

To support OAuth2 authorization this extension needs the "tabs" permission. It is only used when API Console requests OAuth 2 authentication and it only tracks the tab created by the extension.

## Privacy

This extension does not collect any kind of data (not even analytics).
The extension reads the data passed to it from the API Console application and proxies them "as-is" to the API endpoint. The response is then proxied back to the application.

## How it works?

The extension will inject very small portion of JavaScript code into every webpage you visit. The API console fires specific event before making a request. The JavaScript code will recognize this event and handle the request.
This will not affect other web pages you visit.

## Contribute

Want to help? That's cool. Fork and develop the extension and then send a pull request.

Also you can contribute by filling up an issue report. Thanks for any support.

## Credits

This extension was build by Pawel Uchida-Psztyc.
