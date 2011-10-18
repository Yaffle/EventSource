var sys = require('sys');
process.on('uncaughtException', function (e) {
  try {
    sys.puts('Caught exception: ' + e + ' ' + (typeof(e) === 'object' ? e.stack : ''));
  } catch(e0) {}
});


var http = require('http');
var fs = require('fs');

var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();
var querystring = require('querystring');
var history = [];



emitter.on('message', function (data) {
  history.push(data);
});

function constructSSE(res, id, data) {
  res.write((id !== null ? 'id: ' + id + '\n' : '') + 'data: ' + data + '\n\n');
}

http.createServer(function (req, res) {
  var q = require('url').parse(req.url, true);
  if (q.query.message) {
    var time = new Date();
    emitter.emit('message', (time.getDate() + '.' + ('0' + (1 + time.getMonth())).slice(-2) + '.' + time.getFullYear()) + ' ' + time.toLocaleTimeString() + ' IP: ' + req.connection.remoteAddress + ' :: ' + q.query.message);
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('1');    
  }

  function eventStream(post) {
     res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
       //'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': req.headers.origin
    });
    var lastEventId = +req.headers['last-event-id'] || +post['Last-Event-ID'] || 0;
    var polling = !!req.headers['x-requested-with'];

    // 2 kb comment message for XDomainRequest
    res.write(':' + Array(2049).join(' ') + '\n');

    function sendMessages() {
      var somethignSended = lastEventId < history.length;
      while (lastEventId < history.length) {
        res.write('id: ' + (lastEventId + 1) + '\n' + 'data: ' + encodeURIComponent(history[lastEventId]) + '\n\n');
        lastEventId++;
      }
      if (somethignSended && polling) {
        emitter.removeListener('message', sendMessages);
        res.end();
      }
    }

    emitter.addListener('message', sendMessages);
    emitter.setMaxListeners(0);

    // client closes connection
    res.socket.on('close', function () {
      emitter.removeListener('message', sendMessages);
      res.end();
    });

    sendMessages();

  }
  
  if (req.url === '/events') {

    var post = '';
    if (req.method === 'POST') {
      req.addListener('data', function (data) {
        post += data;
      });
      req.addListener('end', function () {
        post = querystring.parse(post);
        eventStream(post);
      });
    } else {
      eventStream({});
    }

  } else {
    if (req.url !== '/example.html' && req.url !== '/eventsource.js' && req.url !== '/sharedworker.js') {
      req.url = '/example.html';
    }
    res.writeHead(200, {'Content-Type': (req.url.indexOf('.js') !== -1 ? 'text/javascript' : 'text/html')});
    res.write(fs.readFileSync(__dirname + req.url));
    res.end();
  }
}).listen(8002);
