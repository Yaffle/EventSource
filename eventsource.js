/**
 * eventsource.js
 * Available under MIT License (MIT)
 * https://github.com/Yaffle/EventSource/
 */

/*jslint indent: 2, vars: true */
/*global setTimeout, clearTimeout, navigator */

(function (global) {
  "use strict";

  function Map() {
    this.data = Object.create ? Object.create(null) : {};
  }

  var hasOwnProperty = Object.prototype.hasOwnProperty;

  var escapeKey = function (key) {
    return key.slice(0, 1) === "_" ? key + "~" : key;
  };

  Map.prototype = {
    get: function (key) {
      var k = escapeKey(key);
      var data = this.data;
      return hasOwnProperty.call(data, k) ? data[k] : undefined;
    },
    set: function (key, value) {
      this.data[escapeKey(key)] = value;
    },
    "delete": function (key) {
      delete this.data[escapeKey(key)];
    }
  };

  function Event(type) {
    this.type = type;
    this.eventPhase = 0;
    this.currentTarget = null;
    this.target = null;
  }

  Event.CAPTURING_PHASE = 1;
  Event.AT_TARGET = 2;
  Event.BUBBLING_PHASE = 3;

  function EventTarget() {
    this.listeners = new Map();
  }

  function throwError(e) {
    setTimeout(function () {
      throw e;
    }, 0);
  }

  EventTarget.prototype = {
    hasListeners: function (type) {
      return this.listeners.get(String(type)) !== undefined;
    },
    invokeEvent: function (event) {
      var type = String(event.type);
      var phase = event.eventPhase;
      var listeners = this.listeners;
      var typeListeners = listeners.get(type);
      if (!typeListeners) {
        return;
      }
      var length = typeListeners.length;
      var i = phase === Event.BUBBLING_PHASE ? 1 : 0;
      var increment = phase === Event.CAPTURING_PHASE || phase === Event.BUBBLING_PHASE ? 2 : 1;
      while (i < length) {
        event.currentTarget = this;
        var listener = typeListeners[i];
        if (listener !== null) {
          try {
            listener.call(this, event);
          } catch (e) {
            throwError(e);
          }
        }
        event.currentTarget = null;
        i += increment;
      }
    },
    dispatchEvent: function (event) {
      event.eventPhase = Event.AT_TARGET;
      this.invokeEvent(event);
    },
    addEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listeners = this.listeners;
      var typeListeners = listeners.get(type);
      if (!typeListeners) {
        listeners.set(type, typeListeners = []); // CAPTURING BUBBLING
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
      var typeListeners = listeners.get(type);
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
        listeners["delete"](type);
      } else {
        listeners.set(type, filtered);
      }
    }
  };

  var XHR = global.XMLHttpRequest;
  var XDR = global.XDomainRequest;
  var xhr2 = Boolean(XHR && ((new XHR()).withCredentials !== undefined));
  var isXHR = xhr2;
  var Transport = xhr2 ? XHR : XDR;
  var CONNECTING = 0;
  var OPEN = 1;
  var CLOSED = 2;
  var digits = /^\d+$/;
  var contentTypeRegExp = /^text\/event\-stream/i;

  function empty() {}

  function getDuration(value, def) {
    if (digits.test(value)) {
      var n = Number(value);
      return n < 1 ? 1 : (n > 18000000 ? 18000000 : n);
    }
    return def;
  }

  function MessageEvent(type, options) {
    Event.call(this, type);
    this.data = options.data;
    this.lastEventId = options.lastEventId;
  }

  var E = function () {};
  E.prototype = Event.prototype;
  MessageEvent.prototype = new E();

  function abort(xhr) {
    xhr.onload = xhr.onerror = xhr.onprogress = xhr.onreadystatechange = empty;
    xhr.abort();
  }

  function EventSource(url, options) {
    url = String(url);

    var that = this;
    var initialRetry = 1000;
    var retry = initialRetry;
    var retryLimit = 300000;
    var heartbeatTimeout = 45000;
    var wasActivity = false;
    var lastEventId = "";
    var xhr = new Transport();
    var timeout = 0;
    var withCredentials = Boolean(xhr2 && options && options.withCredentials);
    var charOffset = 0;
    var opened = false;
    var dataBuffer = [];
    var lastEventIdBuffer = "";
    var eventTypeBuffer = "";
    var responseBuffer = [];
    var readyState = CONNECTING;

    options = null;

    function close() {
      // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
      if (xhr !== null) {
        abort(xhr);
        xhr = null;
      }
      if (timeout !== 0) {
        clearTimeout(timeout);
        timeout = 0;
      }
      readyState = CLOSED;
      that.readyState = CLOSED;
    }

    function setConnectingState(event) {
      if (readyState !== CLOSED) {
        // setTimeout will wait before previous setTimeout(0) have completed
        if (retry > retryLimit) {
          retry = retryLimit;
        }
        timeout = setTimeout(openConnection, retry);
        retry = retry * 2 + 1;

        readyState = CONNECTING;
        that.readyState = CONNECTING;
        event.target = that;
        that.dispatchEvent(event);
        try {
          if (typeof that.onerror === "function") {
            that.onerror(event);
          }
        } catch (e) {
          throwError(e);
        }
      }
    }

    function onError() {
      if (timeout !== 0) {
        clearTimeout(timeout);
        timeout = 0;
      }
      setConnectingState(new Event("error"));
    }

    function onXHRTimeout() {
      timeout = 0;
      onProgress();
      if (wasActivity) {
        wasActivity = false;
        timeout = setTimeout(onXHRTimeout, heartbeatTimeout);
      } else {
        abort(xhr);
        onError();
      }
    }

    function setOpenState(event) {
      if (readyState !== CLOSED) {
        readyState = OPEN;
        that.readyState = OPEN;
        event.target = that;
        that.dispatchEvent(event);
        try {
          if (typeof that.onopen === "function") {
            that.onopen(event);
          }
        } catch (e) {
          throwError(e);
        }
      }
    }

    function dispatchEvent(event) {
      if (readyState !== CLOSED) {
        var type = String(event.type);
        event.target = that;
        that.dispatchEvent(event);
        try {
          if (type === "message" && typeof that.onmessage === "function") {
            that.onmessage(event);
          }
        } catch (e) {
          throwError(e);
        }
      }
    }

    function onProgress() {
      var responseText = xhr.responseText || "";

      if (!opened) {
        var contentType = "";
        if (isXHR) {
          // invalid state error when xhr.getResponseHeader called after xhr.abort or before readyState === 2 in Chrome 18
          if (responseText !== "") {
            contentType = xhr.getResponseHeader("Content-Type");
          }
        } else {
          contentType = xhr.contentType;
        }
        if (contentType && contentTypeRegExp.test(contentType)) {
          opened = true;
          wasActivity = true;
          retry = initialRetry;
          setOpenState(new Event("open"));
        }
      }

      if (opened && readyState !== CLOSED) {
        var part = responseText.slice(charOffset);
        if (part.length > 0) {
          wasActivity = true;
        }
        var i = 0;
        while ((i = part.indexOf("\n")) !== -1) {
          responseBuffer.push(part.slice(0, i));
          var field = responseBuffer.join("");
          responseBuffer.length = 0;
          part = part.slice(i + 1);

          if (field !== "") {
            var value = "";
            var j = field.indexOf(":");
            if (j !== -1) {
              value = field.slice(j + (field.slice(j + 1, j + 2) === " " ? 2 : 1));
              field = field.slice(0, j);
            }

            if (field === "data") {
              dataBuffer.push(value);
            } else if (field === "id") {
              lastEventIdBuffer = value;
            } else if (field === "event") {
              eventTypeBuffer = value;
            } else if (field === "retry") {
              initialRetry = getDuration(value, initialRetry);
              retry = initialRetry;
              if (retryLimit < initialRetry) {
                retryLimit = initialRetry;
              }
            } else if (field === "retryLimit") {//!
              retryLimit = getDuration(value, retryLimit);
            } else if (field === "heartbeatTimeout") {//!
              heartbeatTimeout = getDuration(value, heartbeatTimeout);
              if (timeout !== 0) {
                clearTimeout(timeout);
                timeout = setTimeout(onXHRTimeout, heartbeatTimeout);
              }
            }

          } else {
            // dispatch the event
            if (dataBuffer.length !== 0) {
              lastEventId = lastEventIdBuffer;
              dispatchEvent(new MessageEvent(eventTypeBuffer || "message", {
                data: dataBuffer.join("\n"),
                lastEventId: lastEventIdBuffer
              }));
            }
            // Set the data buffer and the event name buffer to the empty string.
            dataBuffer.length = 0;
            eventTypeBuffer = "";
          }
        }
        if (part !== "") {
          responseBuffer.push(part);
        }
        charOffset = responseText.length;
      }
    }

    function onProgress2() {
      onProgress();
      if (opened && readyState !== CLOSED) {
        if (charOffset > 1024 * 1024) {
          abort(xhr);
          onError();
        }
      }
    }

    function onLoad() {
      onProgress();
      onError();
    }

    function openConnection() {
      timeout = 0;
      if (navigator.onLine === false) {
        // "online" event is not supported under Web Workers
        timeout = setTimeout(openConnection, 500);
        return;
      }
      // XDomainRequest#abort removes onprogress, onerror, onload

      xhr.onload = xhr.onerror = onLoad;

      // onprogress fires multiple times while readyState === 3
      // onprogress should be setted before calling "open" for Firefox 3.6
      if (xhr.mozAnon === undefined) {// Firefox shows loading indicator
        xhr.onprogress = onProgress2;
      }

      // Firefox 3.6
      // onreadystatechange fires more often, than "progress" in Chrome and Firefox
      xhr.onreadystatechange = onProgress2;

      wasActivity = false;
      timeout = setTimeout(onXHRTimeout, heartbeatTimeout);

      charOffset = 0;
      opened = false;
      dataBuffer.length = 0;
      eventTypeBuffer = "";
      lastEventIdBuffer = lastEventId;//resets to last successful
      responseBuffer.length = 0;

      // with GET method in FF xhr.onreadystatechange with readyState === 3 does not work + POST = no-cache
      xhr.open("POST", url, true);

      // withCredentials should be setted after "open" for Safari and Chrome (< 19 ?)
      xhr.withCredentials = withCredentials;

      xhr.responseType = "text";

      if (isXHR) {
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

    EventTarget.call(this);
    this.close = close;
    this.url = url;
    this.readyState = readyState;
    this.withCredentials = withCredentials;

    openConnection();
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
