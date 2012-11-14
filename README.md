EventSource polyfill - http://www.w3.org/TR/eventsource/
========================================================

  Browser support:
  ----------------

  IE 8+, Firefox 3.5+, Chrome 6+, Safari 5+, Opera 12+

  Advantages:
  -----------

  * Simple server-side code - you don't need any library.
  * Based on latest specification of EventSource
  * Polyfill is independent from document methods, so you can use it in a Web Worker's
  * Cross-domain requests support ("withCredentials" is not supported in IE8-IE9)

  Server-side requirements:
  -------------------------

  * "Last-Event-ID" sended in POST body (CORS + "Last-Event-ID" header is not supported by all browsers)
  * IE requires send two kilobyte padding at the top of the response stream - see http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1
  * you need to send "comment" message each 15-30 seconds

  Specification:
  --------------

  * http://www.w3.org/TR/eventsource/

  Other EventSource polyfills:
  ----------------------------

  * https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
  * https://github.com/rwldrn/jquery.eventsource by rick waldron

  Native EventSource bugs (this shim replaces native browsers EventSource object):
  --------------------------------------------------------------------------------
  CORS
  * https://bugzilla.mozilla.org/show_bug.cgi?id=664179 (Firefox 11)
  * https://bugs.webkit.org/show_bug.cgi?id=61862 (not implemented)
  * Opera 12 supports EventSource + CORS

  lastEventId shouldn't be set when connection dropped without data dispatch - http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761
  * https://bugzilla.mozilla.org/show_bug.cgi?id=710546
  * Opera DSK-353296, Opera DSK-346814

  http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
  * DSK-362330 - Opera
  * https://code.google.com/p/chromium/issues/detail?id=125190 - Chrome/Safari (resolved)
  * DSK-362337 - Opera bug with event-stream with "message", "error", "open" events (minor)
  * http://code.google.com/p/chromium/issues/detail?id=86230 - Crhome bug with small "retry" (minor)

  * http://lists.w3.org/Archives/Public/public-webapps/2012AprJun/0388.html

  * http://code.google.com/p/chromium/issues/detail?id=114475
  * https://bugzilla.mozilla.org/show_bug.cgi?id=654579#c9

EXAMPLE
-------



server-side (node.js)
---------------------

```javascript
var http = require('http');
var fs = require('fs');

http.createServer(function (req, res) {
  var t = null;
  if (req.url.indexOf('/events') === 0) {

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE
    res.write('retry: 2000\n');
    res.write('data: ' + Date() + '\n\n');

    t = setInterval(function () {
      res.write('data: ' + Date() + '\n\n');
    }, 1000);

    res.socket.on('close', function () {
      clearInterval(t);
    });


  } else {
    if (req.url === '/index.html' || req.url === '/eventsource.js') {
      res.writeHead(200, {'Content-Type': req.url === '/index.html' ? 'text/html' : 'text/javascript'});
      res.write(fs.readFileSync(__dirname + req.url));
    }
    res.end();
  }
}).listen(8081); //! port :8081
```

or use PHP (see php/events.php)
-------------------------------
```php
<?

  header('Content-Type: text/event-stream');
  header('Cache-Control: no-cache');
  header('Access-Control-Allow-Origin: *');

  // prevent bufferring
  if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', 1);
  }
  @ini_set('zlib.output_compression', 0);
  @ini_set('implicit_flush', 1);
  for ($i = 0; $i < ob_get_level(); $i++) { ob_end_flush(); }
  ob_implicit_flush(1);

  // getting last-event-id from POST or from http headers
  $postData = @file_get_contents('php://input');
  parse_str($postData, $tmp);
  if (isset($tmp['Last-Event-ID'])) {
    $lastEventId = $tmp['Last-Event-ID'];
  } else {
    $lastEventId = @$_SERVER["HTTP_LAST_EVENT_ID"];
  }

  // 2kb padding for IE
  echo ':' . str_repeat(' ', 2048) . "\n";
  echo "retry: 2000\n";

  // event-stream
  for ($i = intval($lastEventId) + 1; $i < 100; $i++) {
    echo "id: $i\n";
    echo "data: $i;\n\n";
    sleep(1);
  }

?>
```

index.html (php/index.html):
----------------------------
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>EventSource example</title>
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <script src="../eventsource.js"></script>
    <script>
      var es = new EventSource('events.php');
      es.addEventListener('open', function (event) {
        var div = document.createElement('div');
        div.innerHTML = 'opened: ' + es.url;
        document.body.appendChild(div);
      });
      es.addEventListener('message', function (event) {
        document.body.appendChild(document.createTextNode(event.data));
      });
      es.addEventListener('error', function (event) {
        var div = document.createElement('div');
        div.innerHTML = 'closed';
        document.body.appendChild(div);
      });
    </script>
</head>
<body>
</body>
</html>
```


License
-------
The MIT License (MIT)

Copyright (c) 2012 vic99999@yandex.ru

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
