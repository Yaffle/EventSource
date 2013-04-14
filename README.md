EventSource polyfill - http://www.w3.org/TR/eventsource/
========================================================

Browser support:
----------------

* IE 8+, Firefox 3.5+, Chrome 6+, Safari 5+, Opera 12+
* It works on Mobile Safari, Android Browser, Opera Mobile, Chrome for Android, Firefox for Android

Advantages:
-----------

* Simple server-side code
* Cross-domain requests support ("withCredentials" is not supported in IE8-IE9)

Server-side requirements:
-------------------------

* "Last-Event-ID" is sent in a query string (CORS + "Last-Event-ID" header is not supported by all browsers)
* It is required to send two kilobyte padding for IE at the top of the response stream
* You need to send "comment" messages each 15-30 seconds, this messages will be used as heartbeat to detect disconnects - see https://bugzilla.mozilla.org/show_bug.cgi?id=444328

Specification:
--------------

* http://www.w3.org/TR/eventsource/

Other EventSource polyfills:
----------------------------

* https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
* https://github.com/rwldrn/jquery.eventsource by rick waldron

EXAMPLE
-------



server-side (node.js)
---------------------

```javascript
var http = require('http');
var fs = require('fs');

http.createServer(function (req, res) {
  var t = 0;
  if (req.url.indexOf('/events') === 0) {

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Last-Event-ID, Cache-Control",
        "Access-Control-Max-Age": "86400"
      });
      res.end();
      return;
    }

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

  if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET');
    header('Access-Control-Allow-Headers: Last-Event-ID, Cache-Control');
    header('Access-Control-Max-Age: 86400');
    exit();
  }

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

  if (isset($_GET['lastEventId'])) {
    $lastEventId = $_GET['lastEventId'];
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
