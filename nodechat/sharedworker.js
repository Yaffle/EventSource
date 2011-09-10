
importScripts('eventsource.js');

var messageHistory = [], es;

self.onconnect = function (event) {
  var port = event.ports[0], 
      origin = self.name || '', i;

  if (!es) {
    es = new EventSource(origin + 'events');
    es.addEventListener('message', function (e) {
      messageHistory.push(e.data);
    }, false);
  }

  for (i = 0; i < messageHistory.length; i++) {
    port.postMessage(messageHistory[i]);
  }
  es.addEventListener('message', function (e) {
    port.postMessage(e.data);
  }, false);

  event = null;  
};
