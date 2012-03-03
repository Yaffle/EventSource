



$(document).ready(function() {

  asyncTest('EventSource constructor', function () {
    var es = new EventSource('events.php');
    ok(es instanceof EventSource, 'failed');    
    es.close();
    start();
  });

  asyncTest('EventSource.CLOSED', function () {
    ok(EventSource.CLOSED === 2, 'failed');    
    start();
  });

  asyncTest('EventSource 1; 2; 3; 4; 5;', function () {
    var es = new EventSource('events.php'),
        s = '', timer;

    function onTimeout() {
      es.close();
      ok(false, 'failed');
      start();
    }

    timer = setTimeout(onTimeout, 2000);

    es.onmessage = function (event) {
      s += ' ' + event.data;
      clearTimeout(timer);
      timer = setTimeout(onTimeout, 2000);
    };

    es.onerror = function () {
      es.close();
      clearTimeout(timer);
      strictEqual(s, ' 1; 2; 3; 4; 5;', 'test 0');
      start();
    };
  });

  asyncTest('EventSource 1; 2; 3; 4; 5;', function () {
    var es = new EventSource('events.php?test=10'),
        s = '', timer;

    function onTimeout() {
      strictEqual(s, ' 1; 2; 3; 4; 5;', 'test 10');
      es.close();
      start();
    }

    timer = setTimeout(onTimeout, 2000);

    es.onmessage = function (event) {
      s += ' ' + event.data;
    };
  });

  asyncTest('EventSource test next', function () {
    var es = new EventSource('events.php?test=1'), 
        closeCount = 0;

    es.onmessage = function (event) {
      if (+event.lastEventId === 2) {
        closeCount = 1000;
        es.close();
        ok(false, 'lastEventId shouldn\' be set when connection dropped without data dispatch (see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761 )');
        start();
      }
    };

    es.onerror = function () {
      closeCount++;
      if (closeCount === 3) {
        es.close();
        ok(true, 'ok');
        start();
      }
    };
  });

  
  asyncTest('EventTarget exceptions throwed from listeners should not stop dispathing', function () {
    var es = new EventSource('events.php?test=1');

    var s = '';
    es.addEventListener('message', function () {
      s += '1';
      throw new Error('test');
    }, false);
    es.addEventListener('message', function () {
      s += '2';
    }, false);
    es.onerror = function () {
      es.close();
      strictEqual(s, '12', '!');
      start();
    }

  });

  asyncTest('EventTarget addEventListener', function () {
    var es = new EventSource('events.php?test=1');
    var s = '';
    function test() {
      s += '1';
      es.close();
      strictEqual(s, '1', '!');
      start();
    }
    es.addEventListener('message', test, false);
    es.addEventListener('message', test, true);
    es.removeEventListener('message', test, false);
    es.onerror = function () {
      es.close();
      strictEqual(s, '1', '!');
      start();
    }
  });

  // http://dev.w3.org/2006/webapi/DOM-Level-3-Events/html/DOM3-Events.html#event-flow
  // Once determined, the candidate event listeners cannot be changed; adding or removing listeners does not affect the current target's candidate event listeners.
  asyncTest('EventTarget addEventListener/removeEventListener', function () {
    var es = new EventSource('events.php?test=1');
    var s = '';
    function a1() {
      s += 1;
      es.removeEventListener('message', a3, false);
      es.addEventListener('message', a4, false);

      setTimeout(function () {
        es.close();
        var t = "Once determined, the candidate event listeners cannot be changed; adding or removing listeners does not affect the current target's candidate event listeners";
        strictEqual(s, '13', t + ' - http://www.w3.org/TR/DOM-Level-3-Events/');
        start();
      }, 0);
    }
    function a2() {
      s += 2;
    }
    function a3() {
      s += 3;
    }
    function a4() {
      s += 4;
    }    
    es.addEventListener('message', a1, false);
    es.addEventListener('message', a2, false);
    es.addEventListener('message', a3, false);
    es.removeEventListener('message', a2, false);

  });

  asyncTest('EventTarget', function () {
    var es = new EventSource('events.php?test=3');
    var s = '';
    es.onmessage = function (e) {
      s = e.data;
      es.close();
    };
    setTimeout(function () {
      es.close();
      strictEqual(s, '', 'Once the end of the file is reached, any pending data must be discarded. (If the file ends in the middle of an event, before the final empty line, the incomplete event is not dispatched.)');
      start();
    }, 200);
  });

  asyncTest('EventTarget#close()', function () {
    var es = new EventSource('events.php?test=2');
    var s = '';
    es.onmessage = function () {
      s += '1';
      es.close();
    };
    setTimeout(function () {
      es.close();
      ok(s === '1', 'http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331');
      start();
    }, 200);
  });

  asyncTest('EventTarget#close()', function () {
    var es = new EventSource('events.php?test=7');
    es.onopen = function () {
      strictEqual(es.readyState, 1);
      start();
      es.close();
    };
  });

  asyncTest('EventTarget CORS', function () {
    var es = new EventSource(location.href.replace('http', 'https') + 'events.php?test=8');

    es.onmessage = function (event) {
      if (event.data === 'ok') {
        ok(true, 'ok');
        start();
        es.close();
      }
    };
    es.onerror = function () {
      if (es.readyState === es.CLOSED) {
        ok(false, 'not ok');
        start();
        es.close();
      }
    };
  });

/*
  asyncTest('EventSource from Worker', function () {
    var s = 0;

    var worker = new Worker('esworker.js?' + Math.random());
    worker.addEventListener('message', function (event) {
      s = 1;
    }, false);

    setTimeout(function () {
      ok(s === 1, '!');
      start();
    }, 1000);

    worker.postMessage('events.php');
  });
*/
  /*
  asyncTest('EventSource from SharedWorker', function () {
    var s = 0;

    setTimeout(function () {
      ok(s === 1, '!');
      start();
    }, 1000);

    var worker = new SharedWorker('esworker.js?' + Math.random());
    worker.port.addEventListener('message', function (event) {
      s = 1;
    }, false);
    worker.port.start();
    worker.port.postMessage('events.php');
  });*/

  asyncTest('EventSource retry delay - see http://code.google.com/p/chromium/issues/detail?id=86230', function () {
    var es = new EventSource('events.php?test=800');
    var s = 0;
    es.onopen = function () {
      if (!s) {
        s = +new Date();
      } else {
        es.close();
        s = +new Date() - s;
        ok(s >= 750, '!' + s);
        start();
      }
    };
  });

});
