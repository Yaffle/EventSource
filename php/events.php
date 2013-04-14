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
  header('Access-Control-Allow-Origin: ' . @$_SERVER['HTTP_ORIGIN']);
  //header('Access-Control-Allow-Credentials: true');

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