var PORT = 8008;

var util = require('util');
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var querystring = require('querystring');

util.puts('Starting server at port = ' + PORT);

process.on('uncaughtException', function (e) {
  try {
    util.puts('Caught exception: ' + e + ' ' + (typeof(e) === 'object' ? e.stack : ''));
  } catch (e0) {}
});

var emitter = new EventEmitter();
var emitter2 = new EventEmitter();
var heartbeatTimeout = 5000;

setInterval(function () {
  emitter.emit("message");
}, heartbeatTimeout / 2);

// 2 kb comment message for XDomainRequest (IE8, IE9)
var header = ':' + Array(2049).join(' ') + '\n' +
             'retry: 1000\n' +
             'retryLimit: 60000\n' +
             'heartbeatTimeout: ' + heartbeatTimeout + '\n';

function eventStream(request, response, uid) {

  function onMessage(from, data) {
    response.write("data: " + encodeURIComponent(from) + " " + encodeURIComponent(data) + "\n\n");
    //console.log("data: " + from + " " + data + "\n\n");
  }

  function sendComment() {
    response.write(":\n");
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*"
  });

  response.write(header);

  emitter.addListener("message", sendComment);
  emitter2.addListener(String(uid), onMessage);
  emitter2.addListener("*", onMessage);
  emitter.setMaxListeners(0);
  emitter2.setMaxListeners(0);

  response.socket.on("close", function () {
    emitter.removeListener("message", sendComment);
    emitter2.removeListener(String(uid), onMessage);
    emitter2.removeListener("*", onMessage);
    response.end();
  });

  response.socket.setTimeout(0); // see http://contourline.wordpress.com/2011/03/30/preventing-server-timeout-in-node-js/
}

http.createServer(function (request, response) {
  var query = require('url').parse(request.url, true).query;
  var id = Number(query.id) || 0;
  var to = query.to === "*" ? "*" : Number(query.to) || 0;

  if (id && to) {
    var from = id;
    var data = query.message;
    response.writeHead(200, {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*"
    });
    emitter2.emit(String(to), from, data);
    response.end("0");
  } else {
    eventStream(request, response, id);
  }

}).listen(PORT);
