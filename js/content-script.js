var ApiConsoleExtension = {
  proxyRequest: function(requestData) {
    chrome.runtime.sendMessage({
      payload: 'xhr-data',
      data: requestData
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      window.postMessage({
        'api-console-payload': 'api-console-response',
        'api-console-extension': true,
        'api-console-data': response
      }, location.origin);
    });
  },

  proxyOauth: function(authData) {
    chrome.runtime.sendMessage({
      payload: 'oauth2-data',
      data: authData
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      window.postMessage({
        'api-console-payload': 'api-console-oauth2-token-response',
        'api-console-extension': true,
        'api-console-data': response
      }, location.origin);
    });
  },

  informInstalled: function() {
    window.postMessage({
      'api-console-payload': 'init',
      'api-console-extension': true
    }, location.origin);
  }
};
window.addEventListener('message', function(e) {
  if (e.source !== window) {
    return;
  }
  var message = e.data || {};
  if (!message.payload) {
    return;
  }
  switch (message.payload) {
    case 'api-console-extension-installed':
      ApiConsoleExtension.informInstalled();
      break;
    case 'api-console-request':
      ApiConsoleExtension.proxyRequest(e.data.detail);
      break;
    case 'api-console-oauth2':
      ApiConsoleExtension.proxyOauth(e.data.detail);
      break;
  }
});
window.addEventListener('api-console-ready', function() {
  ApiConsoleExtension.informInstalled();
});
