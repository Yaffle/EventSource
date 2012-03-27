<?

  $test = intval(@$_REQUEST['test']);

  header('Access-Control-Allow-Origin: ' . @$_SERVER['HTTP_ORIGIN']);
  if ($test == 9) {
    header('Access-Control-Allow-Credentials: true');
  }
  header('Content-Type: text/event-stream');
  header('Cache-Control: no-cache');

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

  if ($test == 0) {
    for ($i = intval($lastEventId) + 1; $i < 6; $i++) {
      echo "id: $i\n";
      echo "data: $i;\n\n";
      sleep(1);
    }
  }

  if ($test == 1) {
    if ($lastEventId == 0) {
      echo "id: 1\n";
      echo "data: data0;\n\n";
      echo "id: 2\n";
      exit("drop connection test");
    } else {
      echo "data: xxx\n\n";
    }
  }

  if ($test == 2) {
    echo "data: data0;\n\ndata: data1;\n\ndata: data2;\n\n";
    exit();
  }

  if ($test == 3) {
    echo "data: data0";
    exit();
  }

  if ($test == 8) {
    if ($lastEventId == 100) {
      echo "data: ok\n\n";        
    } else {
      echo "id: 100\n";
      echo "data: data0;\n\n";
    }
    exit();
  }

  if ($test == 9) {
    echo "data: x" . (@$_COOKIE["testCookie"]) . "\n\n";
  }

  if ($test == 10) {
    for ($i = intval($lastEventId) + 1; $i < 6; $i++) {
      echo "retry: 1000\n";
      echo "id: $i\n";
      echo "data: $i;\n\n";
	  if ($i == 3) {
	    exit();
	  }
    }
  }

  if ($test == 11) {
    echo "data: a\n\n";
    echo "event: open\ndata: b\n\n";
    echo "event: message\ndata: c\n\n";
    echo "event: error\ndata: d\n\n";
    echo "event:\ndata: e\n\n";//пойдет как event: message
    echo "event: end\ndata: f\n\n";
    exit();
  }

  if ($test == 800) {
    echo "retry: 800\n\n";
    exit();
  }

?>