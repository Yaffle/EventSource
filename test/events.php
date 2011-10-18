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
  if (preg_match('#Last\\-Event\\-ID\\=([\\s\\S]+)#ui', @$postData, $tmp)) {
    $lastEventId = urldecode(@$tmp[1]);
  } else {
    $lastEventId = @$_SERVER["HTTP_LAST_EVENT_ID"];
  }

  // 2kb padding for IE
  echo ':' . str_repeat(' ', 2048) . "\n";

  $test = intval(@$_REQUEST['test']);

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

?>