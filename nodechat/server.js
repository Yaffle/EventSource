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
var countSSE = 0;



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
    emitter.emit('message', (time.getDate() + '.' + ('0' + (1+time.getMonth())).slice(-2) + '.' + time.getFullYear()) + ' ' + time.toLocaleTimeString() + ' IP: ' + req.connection.remoteAddress + ' :: ' + q.query.message);
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('1');    
  }

  function eventStream(post) {
     res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    var lastEventId = +req.headers['last-event-id'] || +post['Last-Event-ID'] || 0;
    
    // с двоеточия начинается комментарий - отсылаем ввиде комментарий 2 килобайта пробелов для работы
    // XDomainRequest
    res.write(':' + Array(2049).join(' ') + '\n');
    
    function sendSSE() {
      res.write('event: sse\ndata: ' + countSSE + '\n\n');
    }
    function sendMessages() {
      while (lastEventId < history.length) {
        res.write('id: ' + (lastEventId + 1) + '\n' + 'data: ' + encodeURIComponent(history[lastEventId]) + '\n\n');
        lastEventId++;
      }
    }
    sendMessages();
    sendSSE();
    
    if (req.headers.polling) { // если был заголовок polling - нужно прерывать соединение после отправки данных
      res.end();
      return;
    }

    emitter.addListener('sse', sendSSE);
    emitter.addListener('message', sendMessages);
    emitter.setMaxListeners(0);

    countSSE++;
    emitter.emit('sse', countSSE);

    // когда пользователь отключился:
    res.socket.on('close', function () {
      emitter.removeListener('message', sendMessages);
      emitter.removeListener('sse', sendSSE);
      res.end();

      countSSE--;
      emitter.emit('sse', countSSE);
    });

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
    if (req.url !== '/example.html' && req.url !== '/eventsource.js') {
      req.url = '/example.html';
    }
    res.writeHead(200, {'Content-Type': (req.url.indexOf('.js') !== -1 ? 'text/javascript' : 'text/html')});
    res.write(fs.readFileSync(__dirname + req.url));
    res.end();
  }
}).listen(8002);
