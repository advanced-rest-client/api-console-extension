# API console helper extension to help with the CORS requests.

An extension to be used with Mulesoft's API Console to make CORS requests in Chrome browser.
No need for additional proxy services and complicated setups. Install the extension and read response data on any website hosting the API console.

Install it from [Chrome Web Store](https://chrome.google.com/webstore/detail/olkpohecoakpkpinafnpppponcfojioa);

## Permissions:
- Access to your data in all websites - it is required to actually make a HTTP request to the API endpoint.

## How it works?
The extension will inject very small portion of JavaScript code into every webpage you visit. The API console fires specific event before making a request. The JavaScript code will recognize this event and handle the request.
This will not affect other web pages you visit.

## Contribute
Want to help? That's cool. Fork and develop the extension and then send a pull request.

Also you can contribute by filling up an issue report. Thanks for any support.


-----------
The API console project is part of the [Advanced REST Client project](https://github.com/advanced-rest-client/).
