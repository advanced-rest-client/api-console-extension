window.addEventListener('message', function(e) {
  if (e.source !== window) {
    return;
  }
  var message = e.data || {};
  if (message.payload !== 'api-console-request') {
    return;
  }
  var requestData = e.data.detail;
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
});
window.addEventListener('api-console-ready', function() {
  window.postMessage({
    'api-console-payload': 'init',
    'api-console-extension': true
  }, location.origin);
});
