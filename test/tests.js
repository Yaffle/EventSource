



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

  
  asyncTest('EventTarget exceptions throwed from listeners should not stop dispathing', 1, function () {
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

  // http://dev.w3.org/2006/webapi/DOM-Level-3-Events/html/DOM3-Events.html#event-flow
  // Once determined, the candidate event listeners cannot be changed; adding or removing listeners does not affect the current target's candidate event listeners.
  asyncTest('EventTarget addEventListener/removeEventListener', 1, function () {
    var es = new EventSource('events.php?test=1');
    var s = '';
    function a1() {
      s += 1;
      es.removeEventListener('message', a3, false);
      es.addEventListener('message', a4, false);

      setTimeout(function () {
        es.close();
        strictEqual(s, '13', '!');
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

});
