/**
 * eventsource.js
 * Available under MIT License (MIT)
 * https://github.com/Yaffle/EventSource/
 */

/*jslint indent: 2, vars: true */
/*global setTimeout, clearTimeout, navigator */

(function (global) {
  "use strict";

  function EventTarget() {
    this.listeners = {};
    return this;
  }

  EventTarget.prototype = {
    listeners: null,
    throwError: function (e) {
      setTimeout(function () {
        throw e;
      }, 0);
    },
    invokeEvent: function (event) {
      var type = String(event.type);
      var phase = event.eventPhase;
      var listeners = this.listeners;
      var typeListeners = listeners[type];
      if (!typeListeners) {
        return;
      }
      var length = typeListeners.length;
      var i = phase === 3 ? 1 : 0;
      var increment = phase === 1 || phase === 3 ? 2 : 1;
      while (i < length) {
        event.currentTarget = this;
        try {
          if (typeListeners[i]) {
            typeListeners[i].call(this, event);
          }
        } catch (e) {
          this.throwError(e);
        }
        event.currentTarget = null;
        i += increment;
      }
    },
    dispatchEvent: function (event) {
      event.eventPhase = 2;
      this.invokeEvent(event);
    },
    addEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listeners = this.listeners;
      var typeListeners = listeners[type];
      if (!typeListeners) {
        listeners[type] = typeListeners = []; // CAPTURING BUBBLING
      }
      var i = typeListeners.length - (capture ? 2 : 1);
      while (i >= 0) {
        if (typeListeners[i] === callback) {
          return;
        }
        i -= 2;
      }
      typeListeners.push(capture ? callback : null);
      typeListeners.push(capture ? null : callback);
    },
    removeEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listeners = this.listeners;
      var typeListeners = listeners[type];
      if (!typeListeners) {
        return;
      }
      var length = typeListeners.length;
      var filtered = [];
      var i = 0;
      while (i < length) {
        if (typeListeners[i + (capture ? 0 : 1)] !== callback) {
          filtered.push(typeListeners[i]);
          filtered.push(typeListeners[i + 1]);
        }
        i += 2;
      }
      if (filtered.length === 0) {
        delete listeners[type];
      } else {
        listeners[type] = filtered;
      }
    }
  };

  // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
  // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
  // http://cometdaily.com/2008/page/3/

  var XHR = global.XMLHttpRequest;
  var xhr2 = Boolean(XHR && global.ProgressEvent && ((new XHR()).withCredentials !== undefined));
  var Transport = xhr2 ? XHR : global.XDomainRequest;
  var CONNECTING = 0;
  var OPEN = 1;
  var CLOSED = 2;
  var NONE = -1;

  function empty() {}

  function Node() {
    this.next = null;
    this.event = null;
    this.readyState = 0;
  }

  Node.prototype = {
    next: null,
    event: null,
    readyState: 0
  };

  function delay(value) {
    var n = Number(value);
    return n < 1 ? 1 : (n > 18000000 ? 18000000 : n);
  }

  function Event(type) {
    this.type = type;
    this.eventPhase = 0;
    this.currentTarget = null;
    this.target = null;
  }

  Event.prototype = {
    type: "",
    eventPhase: 0,
    currentTarget: null,
    target: null
  };

  function MessageEvent(type, options) {
    Event.call(this, type);
    this.data = options.data;
    this.lastEventId = options.lastEventId;
  }

  function E() {
    this.data = null;
    this.lastEventId = "";
  }
  E.prototype = Event.prototype;
  MessageEvent.prototype = new E();

  function EventSource(url, options) {
    url = String(url);

    var that = this;
    var retry = 1000;
    var retry2 = retry;
    var retryLimit = 300000;
    var heartbeatTimeout = 45000;
    var xhrTimeout = 0;
    var wasActivity = false;
    var lastEventId = "";
    var xhr = new Transport();
    var reconnectTimeout = 0;
    var withCredentials = Boolean(xhr2 && options && options.withCredentials);
    var charOffset = 0;
    var opened = false;
    var dataBuffer = [];
    var lastEventIdBuffer = "";
    var eventTypeBuffer = "";
    var wasCR = false;
    var responseBuffer = [];
    var isChunkedTextSupported = true;
    var tail = new Node();
    var head = tail;
    var channel = null;
    var isWaitingForOnlineEvent = true;
    var onlineEventIsSupported = false;

    options = null;
    that.url = url;

    that.readyState = CONNECTING;
    that.withCredentials = withCredentials;

    function onOnline(event) {
      if (isWaitingForOnlineEvent) {
        isWaitingForOnlineEvent = false;
        openConnection();
      }
    }

    if (global.addEventListener && global.ononline !== undefined) {
      global.addEventListener("online", onOnline, false);
      onlineEventIsSupported = true;
    }
    //! document.body is null while page is loading
    if (global.document && global.document.body && global.document.body.attachEvent && global.document.body.ononline !== undefined) {
      global.document.body.attachEvent("ononline", onOnline);
      onlineEventIsSupported = true;
    }

    function waitOnLine() {
      reconnectTimeout = 0;
      if (!onlineEventIsSupported || navigator.onLine !== false) {
        openConnection();
      } else {
        isWaitingForOnlineEvent = true;
      }
    }

    // Queue a task which, if the readyState is set to a value other than CLOSED,
    // sets the readyState to ... and fires event

    function onTimeout() {
      var event = head.event;
      var readyState = head.readyState;
      var type = String(event.type);
      head = head.next;

      if (that.readyState !== CLOSED) { // http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
        if (readyState !== NONE) {
          that.readyState = readyState;
        }

        if (readyState === CONNECTING) {
          // setTimeout will wait before previous setTimeout(0) have completed
          if (retry2 > retryLimit) {
            retry2 = retryLimit;
          }
          reconnectTimeout = setTimeout(waitOnLine, retry2);
          retry2 = retry2 * 2 + 1;
        }

        event.target = that;
        that.dispatchEvent(event);

        if ((type === "message" || type === "error" || type === "open") && typeof that["on" + type] === "function") {
          // as IE 8 does not support getters/setters, we cannot implement "onmessage" via addEventListener/removeEventListener
          that["on" + type](event);
        }
      }
    }

    // MessageChannel support: IE 10, Opera 11.6x?, Chrome ?, Safari ?
    if (global.MessageChannel) {
      channel = new global.MessageChannel();
      channel.port1.onmessage = onTimeout;
    }

    function queue(event, readyState) {
      tail.event = event;
      tail.readyState = readyState;
      tail = tail.next = new Node();
      if (channel) {
        channel.port2.postMessage("");
      } else {
        setTimeout(onTimeout, 0);
      }
    }

    function close() {
      if (global.addEventListener) {
        global.removeEventListener("online", onOnline, false);
      }
      if (global.document && global.document.body && global.document.body.attachEvent) {
        global.document.body.detachEvent("ononline", onOnline);
      }
      // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
      if (xhr !== null) {
        xhr.onload = xhr.onerror = xhr.onprogress = xhr.onreadystatechange = empty;
        xhr.abort();
        xhr = null;
      }
      if (reconnectTimeout !== 0) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = 0;
      }
      if (xhrTimeout !== 0) {
        clearTimeout(xhrTimeout);
        xhrTimeout = 0;
      }
      that.readyState = CLOSED;
    }

    that.close = close;

    EventTarget.call(that);

    function onError() {
      //if (opened) {
        // reestablishes the connection
      queue(new Event("error"), CONNECTING);
      //} else {
        // fail the connection
      //  queue(new Event("error"), CLOSED);
      //}
      if (xhrTimeout !== 0) {
        clearTimeout(xhrTimeout);
        xhrTimeout = 0;
      }
    }

    function onXHRTimeout() {
      xhrTimeout = 0;
      onProgress();
      if (wasActivity) {
        wasActivity = false;
        xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);
      } else {
        xhr.onload = xhr.onerror = xhr.onprogress = empty;
        xhr.abort();
        onError();
      }
    }

    function onProgress() {
      var responseText = xhr.responseText || "";
      var contentType = "";
      var i = 0;

      if (!opened) {
        try {
          contentType = xhr.getResponseHeader ? xhr.getResponseHeader("Content-Type") : xhr.contentType;
        } catch (error) {
          // invalid state error when xhr.getResponseHeader called after xhr.abort in Chrome 18
          setTimeout(function () {
            throw error;
          }, 0);
        }
        if (contentType && (/^text\/event\-stream/i).test(contentType)) {
          queue(new Event("open"), OPEN);
          opened = true;
          wasActivity = true;
          retry2 = retry;
        }
      }

      if (opened) {
        var part = responseText.slice(charOffset);
        if (part.length > 0) {
          wasActivity = true;
        }
        if (wasCR && part.length > 0) {
          if (part.slice(0, 1) === "\n") {
            part = part.slice(1);
          }
          wasCR = false;
        }
        while ((i = part.search(/[\r\n]/)) !== -1) {
          var field = responseBuffer.join("") + part.slice(0, i);
          responseBuffer.length = 0;
          if (part.length > i + 1) {
            part = part.slice(i + (part.slice(i, i + 2) === "\r\n" ? 2 : 1));
          } else {
            if (part.slice(i, i + 1) === "\r") {
              wasCR = true;
            }
            part = "";
          }

          if (field) {
            var value = "";
            var j = field.indexOf(":");
            if (j !== -1) {
              value = field.slice(j + (field.slice(j + 1, j + 2) === " " ? 2 : 1));
              field = field.slice(0, j);
            }

            if (field === "event") {
              eventTypeBuffer = value;
            }

            if (field === "id") {
              lastEventIdBuffer = value; // see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761
            }

            if (field === "retry") {
              if (/^\d+$/.test(value)) {
                retry = delay(value);
                retry2 = retry;
                if (retryLimit < retry) {
                  retryLimit = retry;
                }
              }
            }

            if (field === "heartbeatTimeout") {//!
              if (/^\d+$/.test(value)) {
                heartbeatTimeout = delay(value);
                if (xhrTimeout !== 0) {
                  clearTimeout(xhrTimeout);
                  xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);
                }
              }
            }

            if (field === "retryLimit") {//!
              if (/^\d+$/.test(value)) {
                retryLimit = delay(value);
              }
            }

            if (field === "data") {
              dataBuffer.push(value);
            }
          } else {
            // dispatch the event
            if (dataBuffer.length !== 0) {
              lastEventId = lastEventIdBuffer;
              queue(new MessageEvent(eventTypeBuffer || "message", {
                data: dataBuffer.join("\n"),
                lastEventId: lastEventIdBuffer
              }), NONE);
            }
            // Set the data buffer and the event name buffer to the empty string.
            dataBuffer.length = 0;
            eventTypeBuffer = "";
          }
        }
        if (part !== "") {
          responseBuffer.push(part);
        }
        charOffset = isChunkedTextSupported ? 0 : responseText.length;
      }
    }

    function onLoad() {
      onProgress();
      onError();
    }

    function onReadyStateChange() {
      if (xhr.readyState === 3) {
        onProgress();
      }
    }

    function openConnection() {
      // XDomainRequest#abort removes onprogress, onerror, onload

      xhr.onload = xhr.onerror = onLoad;

      // onprogress fires multiple times while readyState === 3
      // onprogress should be setted before calling "open" for Firefox 3.6
      xhr.onprogress = onProgress;

      // Firefox 3.6
      // onreadystatechange fires more often, than "progress" in Chrome and Firefox
      xhr.onreadystatechange = onReadyStateChange;

      reconnectTimeout = 0;
      wasActivity = false;
      xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);

      charOffset = 0;
      opened = false;
      dataBuffer.length = 0;
      eventTypeBuffer = "";
      lastEventIdBuffer = lastEventId;//resets to last successful

      // with GET method in FF xhr.onreadystatechange with readyState === 3 does not work + POST = no-cache
      xhr.open("POST", url, true);

      // withCredentials should be setted after "open" for Safari and Chrome (< 19 ?)
      xhr.withCredentials = withCredentials;

      wasCR = false;
      responseBuffer.length = 0;
      if (isChunkedTextSupported) {
        var t = "moz-chunked-text";
        try {
          if (xhr.setRequestHeader) {
            xhr.responseType = t;
          }
          isChunkedTextSupported = xhr.responseType === t;
        } catch (e) {
          //console.log(e);
        }
      }

      if (xhr.setRequestHeader) { // !XDomainRequest
        // http://dvcs.w3.org/hg/cors/raw-file/tip/Overview.html
        // Cache-Control is not a simple header
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader("Cache-Control", "no-cache");

        // Chrome bug:
        // http://code.google.com/p/chromium/issues/detail?id=71694
        // If you force Chrome to have a whitelisted content-type, either explicitly with setRequestHeader(), or implicitly by sending a FormData, then no preflight is done.
        xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        xhr.setRequestHeader("Accept", "text/event-stream");

        // Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        // +setRequestHeader should not be used to avoid preflight requests
        //if (lastEventId !== "") {
        //  xhr.setRequestHeader("Last-Event-ID", lastEventId);
        //}
      }
      xhr.send(lastEventId !== "" ? "Last-Event-ID=" + encodeURIComponent(lastEventId) : "");
    }

    openConnection();

    return that;
  }

  function F() {
    this.CONNECTING = CONNECTING;
    this.OPEN = OPEN;
    this.CLOSED = CLOSED;
  }
  F.prototype = EventTarget.prototype;

  EventSource.prototype = new F();
  EventSource.CONNECTING = CONNECTING;
  EventSource.OPEN = OPEN;
  EventSource.CLOSED = CLOSED;

  if (Transport) {
    global.EventSource = EventSource;
  }

}(this));
