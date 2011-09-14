EventSource polyfill for browsers, that doesn't implement native EventSource
============================================================================

  Uses XMLHttpRequest:
  "server push" (using XMLHTTPRequest Interactive state, XDomainRequest) logic for Firefox, IE8+ (Opera11+, Chrome8, Safari5 has native support for EventSource)
  "long polling" or "polling" logic for other browsers

  Browser Support:
  IE6+, others

  Advantages:

  * Based on last specification of EventSource.
  * "server push" for Firefox
  * "server push" for IE 8+ with XDomainRequest
  * Polyfill is independent from document methods (addEventListener), so you
  * can use it in a Web Worker's scope.
  * CORS supported for IE 8+, Firefox, Chrome, Safari

  Server-side requirements:
  When "server push" not supported, "Polling" HTTP Header is sended on each request
  to tell your server side script to close connection after 
  sending a data.
  XDomainRequest sends "Last-Event-ID" with POST body (XDomainRequest object does not have a setRequestHeader method)
  Also XDomainRequest requires send two kilobyte “prelude” at the top of the response stream.
  ( http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1 )

  http://weblog.bocoup.com/javascript-eventsource-now-available-in-firefox
  http://www.w3.org/TR/eventsource/

  Other EventSource polyfills:
  https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
  https://github.com/rwldrn/jquery.eventsource by rick waldron




  CORS in native SSE (not implemented yet):
  https://bugzilla.mozilla.org/show_bug.cgi?id=664179
  https://bugs.webkit.org/show_bug.cgi?id=61862


EXAMPLE
-------



server-side (node.js)
---------------------

    var http = require('http');
    var fs = require('fs');

    http.createServer(function (req, res) {
      var t = null;
      if (req.url === '/events') {
    
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
    
        res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE
        res.write('data: ' + Date() + '\n\n');

        t = setInterval(function () {
          res.write('data: ' + Date() + '\n\n');
        }, 1000);
    
        res.socket.on('close', function () {
          clearInterval(t);
        });
    
        if (req.headers.polling) {
          res.end();
        }
    
      } else {
        if (req.url === '/example.html' || req.url === '/eventsource.js') {
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(fs.readFileSync(__dirname + req.url));
        }
        res.end();
      }
    }).listen(8081); //! port :8081


example.html:
-------------

    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>EventSource example</title>
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <script type="text/javascript" src="eventsource.js"></script>
      <script type="text/javascript">
        (new EventSource('/events')).addEventListener('message', function (e) {
          document.getElementById('body').innerHTML += e.data + '<br>';
        }, false);
      </script>
    </head>
    <body id="body">
    </body>
    </html>
