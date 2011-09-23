<?

      header('Content-Type: text/event-stream');
      header('Access-Control-Allow-Origin: *');
      header('Cache-Control: no-cache');

      @apache_setenv('no-gzip', 1);
      @ini_set('zlib.output_compression', 0);
      @ini_set('implicit_flush', 1);
      for ($i = 0; $i < ob_get_level(); $i++) { ob_end_flush(); }
      ob_implicit_flush(1);

      if (preg_match('#Last\\-Event\\-ID\\=([\\s\\S]+)#ui', @$HTTP_RAW_POST_DATA, $tmp)) {
        $lastEventId = urldecode(@$tmp[1]);
      } else {
        $headers = getallheaders();
        $lastEventId = @$headers['Last-Event-ID'];    
      }

      echo ':' . str_repeat(' ', 2048) . "\n"; // 2kb padding for IE

      for ($i = intval($lastEventId) + 1; $i < 100; $i++) {
        echo "id: $i\n";
        echo "data: $i;\n\n";
        sleep(1);
      }

?>