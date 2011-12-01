EventSource polyfill - http://www.w3.org/TR/eventsource/
========================================================

  Browser support:

  IE 8+, Firefox 3.5+, Chrome 7+, Safari 5+, Opera 11+

  Advantages:

  * Simple server-side code - you don't need any library.
  * Based on latest specification of EventSource
  * Polyfill is independent from document methods, so you can use it in a Web Worker's
  * Cross-domain requests supported for IE 8+ (anonymous mode), Firefox 3.5+, Chrome 7+, Safari 5+, Opera 12+

  Server-side requirements:

  * "Last-Event-ID" sended in POST body (CORS + "Last-Event-ID" header is not supported by all browsers)
  * IE requires send two kilobyte padding at the top of the response stream - see http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1

  Specification:

  * http://www.w3.org/TR/eventsource/

  Other EventSource polyfills:

  * https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
  * https://github.com/rwldrn/jquery.eventsource by rick waldron

  Native CORS support with EventSource (not implemented yet):

  * https://bugzilla.mozilla.org/show_bug.cgi?id=664179
  * https://bugs.webkit.org/show_bug.cgi?id=61862
  * Opera 12beta supports EventSource + CORS (credentials mode)

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
      'Connection': 'keep-alive',
       //'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': req.headers.origin
    });

    res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE
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

  header('Access-Control-Allow-Origin: ' . @$_SERVER['HTTP_ORIGIN']);
  //header('Access-Control-Allow-Credentials: true');
  header('Content-Type: text/event-stream');
  header('Cache-Control: no-cache');

  // prevent bufferring
  @apache_setenv('no-gzip', 1);
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
      }, false);
      es.addEventListener('message', function (event) {
        document.body.appendChild(document.createTextNode(event.data));
      }, false);
      es.addEventListener('error', function (event) {
        var div = document.createElement('div');
        div.innerHTML = 'closed';
        document.body.appendChild(div);
      }, false);
    </script>
</head>
<body>
</body>
</html>
```
