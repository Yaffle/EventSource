var PORT1 = 8004;
var PORT2 = 8003;

var util = require('util');
var http = require('http');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var querystring = require('querystring');
var path = require('path');
var URL = require('url');

util.puts('Version: ' + process.version);
util.puts('Starting server at http://localhost:' + PORT1);

process.on('uncaughtException', function (e) {
  try {
    util.puts('Caught exception: ' + e + ' ' + (typeof(e) === 'object' ? e.stack : ''));
  } catch (e0) {}
});

var emitter = new EventEmitter();
var history = [];
var heartbeatTimeout = 9000;
var firstId = Number(new Date());

setInterval(function () {
  emitter.emit('message');
}, heartbeatTimeout / 2);

function onTest(response, lastEventId, test, cookies) {
  var i = lastEventId + 1;
  if (test === 0) {
    var onPing = function (x) {
      response.write("event: pong\ndata: " + x + "\n\n");
    };
    emitter.addListener("ping", onPing);
    response.connection.once('close', function () {
      emitter.removeListener("ping", onPing);
    });
  }
  if (test === 1) {
    if (lastEventId === 0) {
      response.write("id: 1\n");
      response.write("data: data0;\n\n");
      response.write("id: 2\n");
      response.write("drop connection test");
      response.end();
    } else {
      response.write("data: xxx\n\n");
      response.end();
    }
  }
  if (test === 2) {
    response.write("data: data0;\n\ndata: data1;\n\ndata: data2;\n\n");
    response.end();
  }
  if (test === 3) {
    response.write("data: data0");
    response.end();
  }
  if (test === 4) {
    response.write("data\n\n");
    setTimeout(function () {
      response.write("data\n\n");
      setTimeout(function () {
        response.write("data\n\n");
      }, 25);
    }, 25);
    setTimeout(function () {
      response.end();
    }, 10000);
  }
  if (test === 8) {
    if (lastEventId === 100) {
      response.write("data: ok\n\n");
    } else {
      response.write("id: 100\n");
      response.write("data: data0;\n\n");
    }
    response.end();
  }
  if (test === 9) {
    response.write("data: x" + cookies.testCookie + "\n\n");
    response.end();
  }
  if (test === 10) {
    while (i < 6) {
      response.write("retry: 500\n");
      response.write("id: " + i + "\n");
      response.write("data: " + i + ";\n\n");
      if (i === 3) {
        response.end();
        return;
      }
      i += 1;
    }
    response.end();
  }
  if (test === 11) {
    response.write("data: a\n\n");
    response.write("event: open\ndata: b\n\n");
    response.write("event: message\ndata: c\n\n");
    response.write("event: error\ndata: d\n\n");
    response.write("event:\ndata: e\n\n");
    response.write("event: end\ndata: f\n\n");
    response.end();
  }
  if (test === 800) {
    response.write("retry: 800\n\n");
    response.end();
  }
  if (test === 12) {
    response.write("data: a\n\n");
    response.write("data: \x00\n\n");
    response.write("data: b\n\n");
    response.end();
  }
}

function eventStream(request, response) {
  var lastEventId = '';
  var test = Number(URL.parse(request.url, true).query.test);
  var cookies = {};
  var u = URL.parse(request.url, true);

  (request.headers.cookie || '').split(';').forEach(function (cookie) {
    cookie = cookie.split('=');
    cookies[decodeURIComponent(cookie[0].trim())] = decodeURIComponent((cookie[1] || '').trim());
  });

  function sendMessages() {
    lastEventId = Math.max(lastEventId, firstId);
    while (lastEventId - firstId < history.length) {
      response.write('id: ' + (lastEventId + 1) + '\n' + 'data: ' + (history[lastEventId - firstId]).replace(/[\r\n\x00]/g, "\ndata: ") + '\n\n');
      lastEventId += 1;
    }
    response.write(':\n');
  }

  response.socket.on('close', function () {
    emitter.removeListener('message', sendMessages);
    response.end();
  });

  response.socket.setTimeout(0); // see http://contourline.wordpress.com/2011/03/30/preventing-server-timeout-in-node-js/

  var headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  };
  if (test === 9) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  response.writeHead(200, headers);
  lastEventId = +request.headers['last-event-id'] || +u.query.lastEventId || 0;

  // 2 kb comment message for XDomainRequest (IE8, IE9)
  response.write(':' + Array(2049).join(' ') + '\n');
  response.write('retry: 1000\n');
  response.write('retryLimit: 60000\n');
  response.write('heartbeatTimeout: ' + heartbeatTimeout + '\n');//!

  if (!isNaN(test)) {
    onTest(response, lastEventId, test, cookies);
  } else {
    emitter.addListener('message', sendMessages);
    emitter.setMaxListeners(0);
    sendMessages();
  }
}

function onRequest(request, response) {
  var url = request.url;
  var u = URL.parse(url, true);
  var query = u.query;
  var path = u.pathname;
  var time = '';
  var data = '';

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

  if (query.ping) {
    response.writeHead(200, {
      'Content-Type': 'text/plain'
    });
    response.end("ok");
    emitter.emit("ping", query.ping);
    return;
  }

  if (path === '/events') {
    if (request.method === "OPTIONS") {
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Last-Event-ID, Cache-Control",
        "Access-Control-Max-Age": "86400"
      });
      response.end();
      return;
    }
    eventStream(request, response);
  } else {
    var files = [
      '/example.html',
      '/nodechat.css',
      '/eventsource.js',
      '/nodechat.js',
      '/tests.html',
      '/qunit.css',
      '/qunit.js',
      '/tests.js'
    ];
    if (files.indexOf(path) === -1) {
      path = files[0];
    }
    fs.stat(__dirname + path, function (err, stats) {
      if (err) {
        response.writeHead(404);
        response.end();
      } else {
        var mtime = Date.parse(request.headers['if-modified-since']) || 0;
        if (stats.mtime <= mtime) {
          response.writeHead(304);
          response.end();
        } else {
          var raw = fs.createReadStream(__dirname + path);
          response.writeHead(200, {
            'Content-Type': (path.indexOf('.js') !== -1 ? 'text/javascript' : (path.indexOf('.css') !== -1 ? 'text/css' : 'text/html')),
            'Last-Modified': stats.mtime
          });
          raw.pipe(response);
        }
      }
    });
  }
}

http.createServer(onRequest).listen(PORT1);
http.createServer(onRequest).listen(PORT2);
