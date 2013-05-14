/*jslint indent: 2, vars: true, plusplus: true */
/*global setTimeout, clearTimeout, navigator, window, location, asyncTest, EventSource, ok, strictEqual, start, XMLHttpRequest */

this.EventSource = undefined;

window.onload = function () {
  "use strict";

  var url = "/events";
  var url4CORS = "http://" + location.hostname + ":" + (String(location.port) === "8004" ? "8003" : "8004") + "/events";

  asyncTest("Cache-Control: no-cache", function () {
    var es = new EventSource(url + "?test=16");
    var data = "";
    var f = true;
    var counter = 0;
    es.onmessage = function (event) {
      var x = event.data;
      f = data !== x;
      data = x;
      ++counter;
    };
    es.onerror = function () {
      if (counter === 2) {
        es.close();
        ok(f, "failed");
        start();
      }
    };
  });

  asyncTest("EventSource constructor", function () {
    var es = new EventSource(url + "?test=0");
    ok(es instanceof EventSource, "failed");
    es.close();
    start();
  });

  asyncTest("EventSource.CLOSED", function () {
    ok(EventSource.CLOSED === 2, "failed");
    start();
  });

  // Opera bug with "XMLHttpRequest#onprogress"
  asyncTest("EventSource 3 messages with small delay", function () {
    var es = new EventSource(url + "?test=4");
    var n = 0;
    es.onmessage = function () {
      n++;
    };
    es.onerror = es.onopen = function () {
      es.onerror = es.onopen = null;
      setTimeout(function () {
        es.close();
        ok(n === 3, "failed, n = " + n);
        start();
      }, 1000);
    };
  });

  asyncTest("EventSource ping-pong", function () {
    var es = new EventSource(url + "?test=0");
    var n = 0;
    var x = "";
    var timeStamp = +new Date();

    function onTimeout() {
      es.close();
      ok(false, "failed, n = " + n);
      start();
    }

    var timer = setTimeout(onTimeout, 2000);

    function ping() {
      x = String(Math.random());
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url + "?ping=" + x, true);
      xhr.send(null);
    }

    es.onopen = ping;

    es.addEventListener("pong", function (event) {
      if (event.data === x) {
        ++n;
        clearTimeout(timer);
        timer = setTimeout(onTimeout, 2000);
        if (n < 3) {
          ping();
        } else {
          es.onerror();
        }
      }
    });

    es.onerror = function () {
      es.close();
      clearTimeout(timer);
      strictEqual(n, 3, "test 0, duration: " + (+new Date() - timeStamp));
      start();
    };
  });

  asyncTest("EventSource 1; 2; 3; 4; 5;", function () {
    var es = new EventSource(url + "?test=10");
    var s = "";

    function onTimeout() {
      strictEqual(s, " 1; 2; 3; 4; 5;", "test 10");
      es.close();
      start();
    }

    var timer = setTimeout(onTimeout, 2000);

    es.onmessage = function (event) {
      s += " " + event.data;
    };
    es.onerror = function () {
      es.onerror = null;
      clearTimeout(timer);
      timer = setTimeout(onTimeout, 4000);
    };
  });

  // native EventSource is buggy in Opera, FF < 11, Chrome < ?
  asyncTest("EventSource test next", function () {
    var es = new EventSource(url + "?test=1");
    var closeCount = 0;

    es.onmessage = function (event) {
      if (+event.lastEventId === 2) {
        closeCount = 1000;
        es.close();
        ok(false, "lastEventId should not be set when connection dropped without data dispatch (see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761 )");
        start();
      }
    };

    es.onerror = function () {
      closeCount++;
      if (closeCount === 3) {
        es.close();
        ok(true, "ok");
        start();
      }
    };
  });


  asyncTest("EventTarget exceptions throwed from listeners should not stop dispathing", function () {
    var es = new EventSource(url + "?test=1");

    var s = "";
    es.addEventListener("message", function () {
      s += "1";
      throw new Error("test");
    });
    es.addEventListener("message", function () {
      s += "2";
    });
    es.onerror = function () {
      es.close();
      strictEqual(s, "12", "!");
      start();
    };

  });

/*
  asyncTest("EventTarget addEventListener/removeEventListener", function () {
    var es = new EventSource(url + "?test=1");
    var s = "";
    var listeners = {};
    function a(n) {
      return listeners[n] || (listeners[n] = function () {
        s += n;
        if (n === 0) {
          es.removeEventListener("message", a(0));
          es.removeEventListener("message", a(2));
          es.addEventListener("message", a(4));
          setTimeout(function () {
            es.close();
            strictEqual(s, "03", "EventTarget");
            start();
          }, 0);
        }
      });
    }
    es.addEventListener("message", a(0));
    es.addEventListener("message", a(1));
    es.addEventListener("message", a(2));
    es.addEventListener("message", a(3));
    es.removeEventListener("message", a(1));
  });
*/

  // https://developer.mozilla.org/en/DOM/element.removeEventListener#Browser_compatibility
  // optional useCapture

  asyncTest("EventSource test 3", function () {
    var es = new EventSource(url + "?test=3");
    var s = "";
    var f = function () {
      es.onerror = es.onmessage = null;
      es.close();
      strictEqual(s, "", "Once the end of the file is reached, any pending data must be discarded. (If the file ends in the middle of an event, before the final empty line, the incomplete event is not dispatched.)");
      start();
    };
    es.onmessage = function (e) {
      s = e.data;
      f();
    };
    es.onerror = function () {
      f();
    };
  });

  asyncTest("EventSource#close()", function () {
    var es = new EventSource(url + "?test=2");
    var s = "";
    es.onmessage = function () {
      if (s === "") {
        setTimeout(function () {
          es.close();
          ok(s === "1", "http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331");
          start();
        }, 200);
      }
      s += "1";
      es.close();
    };
  });

  asyncTest("EventSource#close()", function () {
    var es = new EventSource(url + "?test=7");
    es.onopen = function () {
      strictEqual(es.readyState, 1);
      start();
      es.close();
    };
  });

  // Native EventSource + CORS: Opera 12, Firefox 11, Chrome 26 (WebKit 537.27)
  asyncTest("EventSource CORS", function () {
    var es = new EventSource(url4CORS + "?test=8");

    es.onmessage = function (event) {
      if (event.data === "ok") {
        ok(true, "ok");
        start();
        es.close();
      }
    };
    es.onerror = function () {
      if (es.readyState === es.CLOSED) {
        ok(false, "not ok");
        start();
        es.close();
      }
    };
  });

  // buggy with native EventSource in Opera - DSK-362337
  asyncTest("event-stream with \"message\", \"error\", \"open\" events", function () {
    var es = new EventSource(url + "?test=11");
    var s = "";
    function handler(event) {
      s += event.data || "";
    }
    es.addEventListener("open", handler);
    es.addEventListener("message", handler);
    es.addEventListener("error", handler);
    es.addEventListener("end", handler);
    es.onerror = function (event) {
      if (!event.data) {// !(event instanceof MessageEvent)
        strictEqual(s, "abcdef");
        start();
        es.close();
      }
    };
  });

  //IE 8 - 9 issue, Native EventSource in Opera 12
  asyncTest("event-stream null character", function () {
    var es = new EventSource(url + "?test=12");
    var ok = false;
    es.addEventListener("message", function (event) {
      if (event.data === "\x00") {
        ok = true;
      }
    });
    es.onerror = function (event) {
      es.close();
      strictEqual(true, ok);
      start();
    };
  });

  asyncTest("EventSource retry delay - see http://code.google.com/p/chromium/issues/detail?id=86230", function () {
    var es = new EventSource(url + "?test=800");
    var s = 0;
    es.onopen = function () {
      if (!s) {
        s = +new Date();
      } else {
        es.close();
        s = +new Date() - s;
        ok(s >= 750, "!" + s);
        start();
      }
    };
  });

  asyncTest("infinite reconnection", function () {
    var es = new EventSource("http://functionfunction" + Math.floor(Math.random() * 1e10) + ".org");
    var n = 0;
    es.onerror = function () {
      ++n;
      if (es.readyState === 2) {
        es.close();
        ok(false, "!");
        start();
      } else {
        if (n === 5) {
          es.close();
          ok(true, "!");
          start();
        }
      }
    };
  });

};
