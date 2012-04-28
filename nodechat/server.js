var PORT = 8002;

var sys = require('sys');
var http = require('http');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var querystring = require('querystring');

process.on('uncaughtException', function (e) {
  try {
    sys.puts('Caught exception: ' + e + ' ' + (typeof(e) === 'object' ? e.stack : ''));
  } catch (e0) {}
});

var emitter = new EventEmitter();
var history = [];

setInterval(function () {
  emitter.emit('message');
}, 15000);

function eventStream(request, response) {
  var post = '',
      lastEventId;

  function sendMessages() {
    while (lastEventId < history.length) {
      response.write('id: ' + (lastEventId + 1) + '\n' + 'data: ' + JSON.stringify(history[lastEventId]) + '\n\n');
      lastEventId += 1;
    }
    response.write(':\n');
  }

  function onRequestEnd() {
    post = querystring.parse(post);// failure ???
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
       //'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': 'http://' + request.headers.host
    });
    lastEventId = +request.headers['last-event-id'] || +post['Last-Event-ID'] || 0;

    // 2 kb comment message for XDomainRequest (IE8, IE9)
    response.write(':' + Array(2049).join(' ') + '\n');

    emitter.addListener('message', sendMessages);
    emitter.setMaxListeners(0);

    sendMessages();
  }

  response.socket.on('close', function () {
    emitter.removeListener('message', sendMessages);
    request.removeListener('end', onRequestEnd);
    response.end();
  });

  request.addListener('data', function (data) {
    if (post.length < 16384) {
      post += data;
    }
  });

  request.addListener('end', onRequestEnd);
  response.socket.setTimeout(0); // see http://contourline.wordpress.com/2011/03/30/preventing-server-timeout-in-node-js/
}

http.createServer(function (request, response) {
  var url = request.url,
      query = require('url').parse(url, true).query,
      time,
      data;

  if (query.message) {
    time = new Date();
    data = '[' + time.toISOString() + '][IP: ' + request.connection.remoteAddress + '] ' + query.message;
    response.writeHead(200, {
      'Content-Type': 'text/plain'
    });
    response.end(String(history.push(data)));
    emitter.emit('message');
    return;
  }

  if (url === '/events') {
    eventStream(request, response);
  } else {
    if (url !== '/example.html' && url !== '/eventsource.js' && url !== '/sharedworker.js') {
      url = '/example.html';
    }
    response.writeHead(200, {
      'Content-Type': (url.indexOf('.js') !== -1 ? 'text/javascript' : 'text/html')
    });
    response.write(fs.readFileSync(__dirname + url));
    response.end();
  }
}).listen(PORT);
