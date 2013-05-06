/**
 * eventsource.js
 * Available under MIT License (MIT)
 * https://github.com/Yaffle/EventSource/
 */

/*jslint indent: 2, vars: true, plusplus: true */
/*global setTimeout, clearTimeout, navigator */

(function (global) {
  "use strict";

  function Map() {
    this.data = {};
  }

  Map.prototype = {
    get: function (key) {
      return this.data[key + "~"];
    },
    set: function (key, value) {
      this.data[key + "~"] = value;
    },
    "delete": function (key) {
      delete this.data[key + "~"];
    }
  };

  function EventTarget() {
    this.listeners = new Map();
  }

  function throwError(e) {
    setTimeout(function () {
      throw e;
    }, 0);
  }

  EventTarget.prototype = {
    dispatchEvent: function (event) {
      var type = String(event.type);
      var listeners = this.listeners;
      var typeListeners = listeners.get(type);
      if (!typeListeners) {
        return;
      }
      var length = typeListeners.length;
      var i = -1;
      while (++i < length) {
        var listener = typeListeners[i];
        try {
          listener.call(this, event);
        } catch (e) {
          throwError(e);
        }
      }
    },
    addEventListener: function (type, callback) {
      type = String(type);
      var listeners = this.listeners;
      var typeListeners = listeners.get(type);
      if (!typeListeners) {
        listeners.set(type, typeListeners = []);
      }
      var i = typeListeners.length;
      while (--i >= 0) {
        if (typeListeners[i] === callback) {
          return;
        }
      }
      typeListeners.push(callback);
    },
    removeEventListener: function (type, callback) {
      type = String(type);
      var listeners = this.listeners;
      var typeListeners = listeners.get(type);
      if (!typeListeners) {
        return;
      }
      var length = typeListeners.length;
      var filtered = [];
      var i = -1;
      while (++i < length) {
        if (typeListeners[i] !== callback) {
          filtered.push(typeListeners[i]);
        }
      }
      if (filtered.length === 0) {
        listeners["delete"](type);
      } else {
        listeners.set(type, filtered);
      }
    }
  };

  function Event(type) {
    this.type = type;
  }

  function MessageEvent(type, options) {
    Event.call(this, type);
    this.data = options.data;
    this.lastEventId = options.lastEventId;
  }

  MessageEvent.prototype = Event.prototype;

  var XHR = global.XMLHttpRequest;
  var XDR = global.XDomainRequest;
  var xhr2 = Boolean(XHR && ((new XHR()).withCredentials !== undefined));
  var isXHR = xhr2;
  var Transport = xhr2 ? XHR : XDR;
  var WAITING = -1;
  var CONNECTING = 0;
  var OPEN = 1;
  var CLOSED = 2;
  var contentTypeRegExp = /^text\/event\-stream;?(\s*charset\=utf\-8)?$/i;
  var webkitBefore535 = /AppleWebKit\/5([0-2][0-9]|3[0-4])[^\d]/.test(navigator.userAgent);

  function getDuration(value, def) {
    var n = Number(value);
    return (n < 1 ? 1 : (n > 18000000 ? 18000000 : n)) || def;
  }

  function fire(f, event) {
    try {
      if (typeof f === "function") {
        f(event);
      }
    } catch (e) {
      throwError(e);
    }
  }

  function EventSource(url, options) {
    url = String(url);

    var withCredentials = Boolean(xhr2 && options && options.withCredentials);
    var initialRetry = getDuration(options ? options.retry : NaN, 1000);
    var retryLimit = getDuration(options ? options.retryLimit : NaN, 300000);
    var heartbeatTimeout = getDuration(options ? options.heartbeatTimeout : NaN, 45000);
    var lastEventId = (options && options.lastEventId && String(options.lastEventId)) || "";
    var that = this;
    var retry = initialRetry;
    var wasActivity = false;
    var xhr = new Transport();
    var timeout = 0;
    var charOffset = 0;
    var currentState = WAITING;
    var dataBuffer = [];
    var lastEventIdBuffer = "";
    var eventTypeBuffer = "";
    var responseBuffer = [];
    var wasCR = false;
    var progressTimeout = 0;
    var wasAct = false;

    options = null;

    function close() {
      currentState = CLOSED;
      if (xhr !== null) {
        xhr.abort();
        xhr = null;
      }
      if (timeout !== 0) {
        clearTimeout(timeout);
        timeout = 0;
      }
      that.readyState = CLOSED;
    }

    function onProgress(isLoadEnd) {
      var responseText = currentState === OPEN || currentState === CONNECTING ? xhr.responseText || "" : "";
      var event = null;

      if (currentState === CONNECTING) {
        // invalid state error when xhr.getResponseHeader called after xhr.abort or before readyState === 2 in Chrome 18
        var contentType = isXHR ? (responseText !== "" ? xhr.getResponseHeader("Content-Type") : "") : xhr.contentType;
        //var status = isXHR ? (responseText !== "" ? xhr.status : 0) : 200;
        if (contentType && contentTypeRegExp.test(contentType)) {
          currentState = OPEN;
          wasActivity = true;
          retry = initialRetry;
          that.readyState = OPEN;
          event = new Event("open");
          that.dispatchEvent(event);
          fire(that.onopen, event);
          if (currentState === CLOSED) {
            return;
          }
        }
      }

      if (currentState === OPEN) {
        if (responseText.length > charOffset) {
          wasAct = true;
          wasActivity = true;
        }
        var i = 0;
        var i1 = responseText.indexOf("\r", charOffset);
        var i2 = responseText.indexOf("\n", charOffset);
        while (i1 !== -1 || i2 !== -1) {
          if (i1 === -1 || (i2 !== -1 && i2 < i1)) {
            i = i2;
            i2 = responseText.indexOf("\n", i + 1);
          } else {
            i = i1;
            i1 = responseText.indexOf("\r", i + 1);
          }
          var line = responseText.slice(charOffset, i);
          var oldWasCR = wasCR;
          wasCR = responseText.slice(i, i + 1) === "\r";
          charOffset = i + 1;
          if (!oldWasCR || line.length !== 0 || wasCR) {
            responseBuffer.push(line);
            var field = responseBuffer.join("");
            responseBuffer.length = 0;

            if (field !== "") {
              var value = "";
              var j = field.indexOf(":", 0);
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
                  timeout = setTimeout(onTimeout, heartbeatTimeout);
                }
              }

            } else {
              // dispatch the event
              if (dataBuffer.length !== 0) {
                lastEventId = lastEventIdBuffer;
                var type = eventTypeBuffer || "message";
                event = new MessageEvent(type, {
                  data: dataBuffer.join("\n"),
                  lastEventId: lastEventIdBuffer
                });
                that.dispatchEvent(event);
                if (type === "message") {
                  fire(that.onmessage, event);
                }
                if (currentState === CLOSED) {
                  return;
                }
              }
              // Set the data buffer and the event name buffer to the empty string.
              dataBuffer.length = 0;
              eventTypeBuffer = "";
            }
          }
        }
        if (charOffset !== responseText.length) {
          responseBuffer.push(responseText.slice(charOffset));
          charOffset = responseText.length;
        }
      }

      // workaround for Opera issue
      if (wasAct && progressTimeout === 0) {
        wasAct = false;
        progressTimeout = setTimeout(p, 80);
      }

      if ((currentState === OPEN || currentState === CONNECTING) &&
          (isLoadEnd || (charOffset > 1024 * 1024) || (timeout === 0 && !wasActivity))) {
        currentState = WAITING;
        xhr.abort();
        if (timeout !== 0) {
          clearTimeout(timeout);
          timeout = 0;
        }
        if (retry > retryLimit) {
          retry = retryLimit;
        }
        timeout = setTimeout(onTimeout, retry);
        retry = retry * 2 + 1;

        that.readyState = CONNECTING;
        event = new Event("error");
        that.dispatchEvent(event);
        fire(that.onerror, event);
      } else {
        if (timeout === 0) {
          wasActivity = false;
          timeout = setTimeout(onTimeout, heartbeatTimeout);
        }
      }
    }

    function p() {
      progressTimeout = 0;
      onProgress(false);
    }

    function onProgress2() {
      onProgress(false);
    }

    function onLoadEnd() {
      onProgress(true);
    }

    function onTimeout() {
      timeout = 0;
      if (currentState !== WAITING) {
        onProgress(false);
        return;
      }
      if (navigator.onLine === false) {
        // "online" event is not supported under Web Workers
        timeout = setTimeout(onTimeout, 500);
        return;
      }
      // loading indicator in Safari, Chrome < 14
      if (webkitBefore535 && global.document && (global.document.readyState === "loading" || global.document.readyState === "interactive")) {
        timeout = setTimeout(onTimeout, 100);
        return;
      }
      // XDomainRequest#abort removes onprogress, onerror, onload

      xhr.onload = xhr.onerror = onLoadEnd;

      // onprogress fires multiple times while readyState === 3
      // onprogress should be setted before calling "open" for Firefox 3.6
      if (xhr.mozAnon === undefined) {// Firefox shows loading indicator
        xhr.onprogress = onProgress2;
      } else {
        // Firefox 3.6
        xhr.onreadystatechange = onProgress2;
      }

      wasActivity = false;
      timeout = setTimeout(onTimeout, heartbeatTimeout);

      charOffset = 0;
      currentState = CONNECTING;
      dataBuffer.length = 0;
      eventTypeBuffer = "";
      lastEventIdBuffer = lastEventId;//resets to last successful
      responseBuffer.length = 0;
      wasCR = false;

      xhr.open("GET", url + ((url.indexOf("?", 0) === -1 ? "?" : "&") + "lastEventId=" + encodeURIComponent(lastEventId) + "&r=" + String(Math.random() + 1).slice(2)), true);

      // withCredentials should be setted after "open" for Safari and Chrome (< 19 ?)
      xhr.withCredentials = withCredentials;

      xhr.responseType = "text";

      if (isXHR) {
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        // "Cache-control: no-cache" are not honored in Chrome and Firefox
        // https://bugzilla.mozilla.org/show_bug.cgi?id=428916
        //xhr.setRequestHeader("Cache-Control", "no-cache");
        xhr.setRequestHeader("Accept", "text/event-stream");
        // Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader("Last-Event-ID", lastEventId);
      }

      xhr.send(null);
    }

    EventTarget.call(this);
    this.close = close;
    this.url = url;
    this.readyState = CONNECTING;
    this.withCredentials = withCredentials;

    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;

    onTimeout();
  }

  function F() {
    this.CONNECTING = CONNECTING;
    this.OPEN = OPEN;
    this.CLOSED = CLOSED;
  }
  F.prototype = EventTarget.prototype;

  EventSource.prototype = new F();
  F.call(EventSource);

  if (Transport) {
    global.EventSource = EventSource;
  }

}(this));
