



$(document).ready(function() {

  asyncTest('EventSource 1; 2; 3; 4; 5;', 1, function () {
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

  asyncTest('EventSource test next', 1, function () {
    var es = new EventSource('events.php?test=1'), 
        closeCount = 0;

    // failed in Opera since Opera native EventSource used
    es.onmessage = function (event) {
      if (+event.lastEventId === 2) {
        ok(false, 'lastEventId shouldn\' be set when connection dropped without data dispatch (see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761 )');
        start();
        closeCount = 1000;
      }
    };

    es.onerror = function () {
      closeCount++;
      if (closeCount === 3) {
        ok(true, 'ok');
        start();
        es.close();
      }
    };
  });

});
