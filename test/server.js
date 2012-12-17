var PORT1 = 8003;
var PORT2 = 8004;

var util = require('util');
var http = require('http');
var fs = require('fs');
var querystring = require('querystring');
var path = require('path');
var URL = require('url');

util.puts('Version: ' + process.version);
util.puts('Starting server at http://localhost:' + PORT1);

function eventStream(request, response) {
  var post = '',
      lastEventId,
      test = Number(URL.parse(request.url, true).query.test) || 0,
      cookies = {};

  (request.headers.cookie || '').split(';').forEach(function (cookie) {
    cookie = cookie.split('=');
    cookies[decodeURIComponent(cookie[0].trim())] = decodeURIComponent((cookie[1] || '').trim());
  });

  function sendMessages() {
    while (lastEventId < history.length) {
      response.write('id: ' + (lastEventId + 1) + '\n' + 'data: ' + JSON.stringify(history[lastEventId]) + '\n\n');
      lastEventId += 1;
    }
  }

  function onRequestEnd() {
    post = querystring.parse(post);// failure ???
    var headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': 'http://' + request.headers.host.split(':')[0] + ':' + PORT1
    };
    if (test === 9) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    response.writeHead(200, headers);
    lastEventId = +request.headers['last-event-id'] || +post['Last-Event-ID'] || 0;

    // 2 kb comment message for XDomainRequest (IE8, IE9)
    response.write(':' + Array(2049).join(' ') + '\n');

    var i = lastEventId + 1;
    if (test === 0) {
      var intervalId = setInterval(function () {
        response.write("id: " + i + "\n");
        response.write("data: " + i + ";\n\n");
        i += 1;
        if (i > 5) {
          response.end();
        }
      }, 1000);
      response.connection.once('close', function () {
        clearInterval(intervalId);
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

    if (test === 8) {
      if (lastEventId === 100) {
        response.write("data: ok\n\n");
      } else {
        response.write("id: 100\n\n");
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
        response.write("retry: 1000\n");
        response.write("id: " + i + "\n");
        response.write("data: " + i + ";\n\n");
	    if (i === 3) {
	      response.end();
          return;
	    }
        i += 1;
      }
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
      response.write("data: \x00\ud800\udc01\n\n");
      response.end();
    }
  }

  response.connection.once('close', function () {
    request.removeListener('end', onRequestEnd);
    response.end();
  });

  request.addListener('data', function (data) {
    if (post.length < 16384) {
      post += data;
    }
  });

  request.addListener('end', onRequestEnd);
  response.connection.setTimeout(0); // see http://contourline.wordpress.com/2011/03/30/preventing-server-timeout-in-node-js/
}

function onRequest(request, response) {
  var url = request.url;
  util.puts(url);
  if (url.split('?')[0] === '/events') {
    eventStream(request, response);
  } else {
    url = path.resolve(__dirname + (url === '/eventsource.js' ? '/..' + url : '/' + (url.split('/').pop() || 'index.html')));
    path.exists(url, function (exists) {
      if (!exists || fs.statSync(url).isDirectory()) {
        response.writeHead(404, {});
        response.end();
        return;
      }
      var ext = path.extname(url);
      response.writeHead(200, {
        'Content-Type': ext === '.js' ? 'text/javascript' : (ext === '.css' ? 'text/css' : 'text/html')
      });
      response.write(fs.readFileSync(url));
      response.end();
    });
  }
}

http.createServer(onRequest).listen(PORT1);
http.createServer(onRequest).listen(PORT2);
