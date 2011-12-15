importScripts('../eventsource.js');

self.onmessage = function (event) {
  var es = new EventSource(event.data);
  es.onmessage = function (e) {
    es.close();
    self.postMessage(e.data);
  };
};

// for SharedWorkers
self.onconnect = function (event) {
  var port = event.ports[0];
  port.onmessage = function (event) {
    var es = new EventSource(event.data);
    es.onmessage = function (e) {
      es.close();
      port.postMessage(e.data);
    };
  };
};
