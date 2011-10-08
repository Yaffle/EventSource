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

      $test = intval(@$_REQUEST['test']);

      echo ':' . str_repeat(' ', 2048) . "\n"; // 2kb padding for IE

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

?>