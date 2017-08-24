/** @license
 * eventsource.js
 * Available under MIT License (MIT)
 * https://github.com/Yaffle/EventSource/
 */

/*jslint indent: 2, vars: true, plusplus: true */
/*global setTimeout, clearTimeout */

(function (global) {
  "use strict";

  var setTimeout = global.setTimeout;
  var clearTimeout = global.clearTimeout;
  var XMLHttpRequest = global.XMLHttpRequest;
  var XDomainRequest = global.XDomainRequest;
  var NativeEventSource = global.EventSource;

  var k = function () {
  };

  function XHRTransport(xhr) {
    this.xhr = xhr;
    this.abort = k;
  }

  XHRTransport.prototype.open = function (onStartCallback, onProgressCallback, onFinishCallback, thisArg, url, withCredentials, headers) {
    this.abort(true);

    var xhr = this.xhr;
    var state = 1;
    var offset = 0;
    var timeout = 0;

    this.abort = function (silent) {
      if (state === 1 || state === 2 || state === 3) {
        state = 4;
        xhr.onload = k;
        xhr.onerror = k;
        xhr.onabort = k;
        xhr.onprogress = k;
        xhr.onreadystatechange = k;
        // IE 8 - 9: XDomainRequest#abort() does not fire any event
        // Opera < 10: XMLHttpRequest#abort() does not fire any event
        xhr.abort();
        if (timeout !== 0) {
          clearTimeout(timeout);
          timeout = 0;
        }
        if (!silent) {
          onFinishCallback.call(thisArg);
        }
      }
      state = 0;
    };

    var onStart = function () {
      if (state === 1) {
        //state = 2;
        var status = 0;
        var statusText = "";
        var contentType = undefined;
        if (!("contentType" in xhr)) {
          try {
            status = xhr.status;
            statusText = xhr.statusText;
            contentType = xhr.getResponseHeader("Content-Type");
          } catch (error) {
            // IE < 10 throws exception for `xhr.status` when xhr.readyState === 2 || xhr.readyState === 3
            // Opera < 11 throws exception for `xhr.status` when xhr.readyState === 2
            // https://bugs.webkit.org/show_bug.cgi?id=29121
            status = 0;
            statusText = "";
            contentType = undefined;
            // Firefox < 14, Chrome ?, Safari ?
            // https://bugs.webkit.org/show_bug.cgi?id=29658
            // https://bugs.webkit.org/show_bug.cgi?id=77854
          }
        } else {
          status = 200;
          statusText = "OK";
          contentType = xhr.contentType;
        }
        if (status !== 0) {
          state = 2;
          onStartCallback.call(thisArg, status, statusText, contentType);
        }
      }
    };
    var onProgress = function () {
      onStart();
      if (state === 2 || state === 3) {
        state = 3;
        var responseText = "";
        try {
          responseText = xhr.responseText;
        } catch (error) {
          // IE 8 - 9 with XMLHttpRequest
        }
        var chunk = responseText.slice(offset);
        offset += chunk.length;
        onProgressCallback.call(thisArg, chunk);
      }
    };
    var onFinish = function () {
      // Firefox 52 fires "readystatechange" (xhr.readyState === 4) without final "readystatechange" (xhr.readyState === 3)
      // IE 8 fires "onload" without "onprogress"
      onProgress();
      if (state === 1 || state === 2 || state === 3) {
        state = 4;
        if (timeout !== 0) {
          clearTimeout(timeout);
          timeout = 0;
        }
        onFinishCallback.call(thisArg);
      }
    };
    var onReadyStateChange = function () {
      if (xhr != undefined) { // Opera 12
        if (xhr.readyState === 4) {
          onFinish();
        } else if (xhr.readyState === 3) {
          onProgress();
        } else if (xhr.readyState === 2) {
          onStart();
        }
      }
    };
    var onTimeout = function () {
      timeout = setTimeout(function () {
        onTimeout();
      }, 500);
      if (xhr.readyState === 3) {
        onProgress();
      }
    };

    // XDomainRequest#abort removes onprogress, onerror, onload
    xhr.onload = onFinish;
    xhr.onerror = onFinish;
    // improper fix to match Firefox behaviour, but it is better than just ignore abort
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=768596
    // https://bugzilla.mozilla.org/show_bug.cgi?id=880200
    // https://code.google.com/p/chromium/issues/detail?id=153570
    // IE 8 fires "onload" without "onprogress
    xhr.onabort = onFinish;

    // https://bugzilla.mozilla.org/show_bug.cgi?id=736723    
    if (XMLHttpRequest != undefined && !("sendAsBinary" in XMLHttpRequest.prototype) && !("mozAnon" in XMLHttpRequest.prototype)) {
      xhr.onprogress = onProgress;
    }

    // IE 8 - 9 (XMLHTTPRequest)
    // Opera < 12
    // Firefox < 3.5
    // Firefox 3.5 - 3.6 - ? < 9.0
    // onprogress is not fired sometimes or delayed
    // see also #64
    xhr.onreadystatechange = onReadyStateChange;

    xhr.open("GET", url, true);
    // withCredentials should be set after "open" for Safari and Chrome (< 19 ?)
    xhr.withCredentials = withCredentials;
    xhr.responseType = "text";
    if ("setRequestHeader" in xhr) {
      for (var name in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, name)) {
          xhr.setRequestHeader(name, headers[name]);
        }
      }
    }
    try {
      // xhr.send(); throws "Not enough arguments" in Firefox 3.0
      xhr.send(undefined);
    } catch (error1) {
      // Safari 5.1.7, Opera 12
      throw error1;
    }
    if ("readyState" in xhr) {
      // workaround for Opera 12 issue with "progress" events
      // #91
      timeout = setTimeout(function () {
        onTimeout();
      }, 0);
    }
  };
  XHRTransport.prototype.cancel = function () {
    this.abort(false);
  };


  function Map() {
    this._data = {};
  }

  Map.prototype.get = function (key) {
    return this._data[key + "~"];
  };
  Map.prototype.set = function (key, value) {
    this._data[key + "~"] = value;
  };
  Map.prototype["delete"] = function (key) {
    delete this._data[key + "~"];
  };

  function EventTarget() {
    this._listeners = new Map();
  }

  function throwError(e) {
    setTimeout(function () {
      throw e;
    }, 0);
  }

  EventTarget.prototype.dispatchEvent = function (event) {
    event.target = this;
    var type = event.type.toString();
    var listeners = this._listeners;
    var typeListeners = listeners.get(type);
    if (typeListeners == undefined) {
      return;
    }
    var length = typeListeners.length;
    var listener = undefined;
    for (var i = 0; i < length; i += 1) {
      listener = typeListeners[i];
      try {
        if (typeof listener.handleEvent === "function") {
          listener.handleEvent(event);
        } else {
          listener.call(this, event);
        }
      } catch (e) {
        throwError(e);
      }
    }
  };
  EventTarget.prototype.addEventListener = function (type, callback) {
    type = type.toString();
    var listeners = this._listeners;
    var typeListeners = listeners.get(type);
    if (typeListeners == undefined) {
      typeListeners = [];
      listeners.set(type, typeListeners);
    }
    for (var i = typeListeners.length; i >= 0; i -= 1) {
      if (typeListeners[i] === callback) {
        return;
      }
    }
    typeListeners.push(callback);
  };
  EventTarget.prototype.removeEventListener = function (type, callback) {
    type = type.toString();
    var listeners = this._listeners;
    var typeListeners = listeners.get(type);
    if (typeListeners == undefined) {
      return;
    }
    var length = typeListeners.length;
    var filtered = [];
    for (var i = 0; i < length; i += 1) {
      if (typeListeners[i] !== callback) {
        filtered.push(typeListeners[i]);
      }
    }
    if (filtered.length === 0) {
      listeners["delete"](type);
    } else {
      listeners.set(type, filtered);
    }
  };

  function Event(type) {
    this.type = type;
    this.target = undefined;
  }

  function MessageEvent(type, options) {
    Event.call(this, type);
    this.data = options.data;
    this.lastEventId = options.lastEventId;
  }

  MessageEvent.prototype = Event.prototype;

  var isCORSSupported = XMLHttpRequest != undefined && (new XMLHttpRequest()).withCredentials != undefined;
  var Transport = isCORSSupported || (XMLHttpRequest != undefined && XDomainRequest == undefined) ? XMLHttpRequest : XDomainRequest;

  var WAITING = -1;
  var CONNECTING = 0;
  var OPEN = 1;
  var CLOSED = 2;
  var AFTER_CR = 3;
  var FIELD_START = 4;
  var FIELD = 5;
  var VALUE_START = 6;
  var VALUE = 7;
  var contentTypeRegExp = /^text\/event\-stream;?(\s*charset\=utf\-8)?$/i;

  var MINIMUM_DURATION = 1000;
  var MAXIMUM_DURATION = 18000000;

  var getDuration = function (value, def) {
    var n = value;
    if (n !== n) {
      n = def;
    }
    return (n < MINIMUM_DURATION ? MINIMUM_DURATION : (n > MAXIMUM_DURATION ? MAXIMUM_DURATION : n));
  };

  var fire = function (that, f, event) {
    try {
      if (typeof f === "function") {
        f.call(that, event);
      }
    } catch (e) {
      throwError(e);
    }
  };

  function EventSourcePolyfill(url, options) {
    EventTarget.call(this);

    this.onopen = undefined;
    this.onmessage = undefined;
    this.onerror = undefined;

    this.url = "";
    this.readyState = CONNECTING;
    this.withCredentials = false;

    this._internal = new EventSourceInternal(this, url, options);
  }

  function EventSourceInternal(es, url, options) {
    this.url = url.toString();
    this.readyState = CONNECTING;
    this.withCredentials = isCORSSupported && options != undefined && Boolean(options.withCredentials);

    this.es = es;
    this.initialRetry = getDuration(1000, 0);
    this.heartbeatTimeout = getDuration(45000, 0);

    this.lastEventId = "";
    this.retry = this.initialRetry;
    this.wasActivity = false;
    var CurrentTransport = options != undefined && options.Transport != undefined ? options.Transport : Transport;
    this.headers = options != undefined && options.headers != undefined ? JSON.parse(JSON.stringify(options.headers)) : undefined;
    var xhr = new CurrentTransport();
    this.transport = new XHRTransport(xhr);
    this.timeout = 0;
    this.currentState = WAITING;
    this.dataBuffer = [];
    this.lastEventIdBuffer = "";
    this.eventTypeBuffer = "";

    this.textBuffer = "";
    this.state = FIELD_START;
    this.fieldStart = 0;
    this.valueStart = 0;

    this.es.url = this.url;
    this.es.readyState = this.readyState;
    this.es.withCredentials = this.withCredentials;

    this.onTimeout();
  }

  EventSourceInternal.prototype.onStart = function (status, statusText, contentType) {
    if (this.currentState === CONNECTING) {
      if (status === 200 && contentType != undefined && contentTypeRegExp.test(contentType)) {
        this.currentState = OPEN;
        this.wasActivity = true;
        this.retry = this.initialRetry;
        this.readyState = OPEN;
        this.es.readyState = OPEN;
        var event = new Event("open");
        this.es.dispatchEvent(event);
        fire(this.es, this.es.onopen, event);
      } else {
        var message = "";
        if (status !== 200) {
          if (statusText) {
            statusText = statusText.replace(/\s+/g, " ")
          }
          message = "EventSource's response has a status " + status + " " + statusText + " that is not 200. Aborting the connection.";
        } else {
          message = "EventSource's response has a Content-Type specifying an unsupported type: " + (contentType == undefined ? "-" : contentType.replace(/\s+/g, " ")) + ". Aborting the connection.";
        }
        throwError(new Error(message));
        this.close();
        var event = new Event("error");
        this.es.dispatchEvent(event);
        fire(this.es, this.es.onerror, event);
      }
    }
  };

  EventSourceInternal.prototype.onProgress = function (textChunk) {
    if (this.currentState === OPEN) {
      var n = -1;
      for (var i = 0; i < textChunk.length; i += 1) {
        var c = textChunk.charCodeAt(i);
        if (c === "\n".charCodeAt(0) || c === "\r".charCodeAt(0)) {
          n = i;
        }
      }
      var chunk = (n !== -1 ? this.textBuffer : "") + textChunk.slice(0, n + 1);
      this.textBuffer = (n === -1 ? this.textBuffer : "") + textChunk.slice(n + 1);
      var length = chunk.length;
      if (length !== 0) {
        this.wasActivity = true;
      }
      for (var position = 0; position < length; position += 1) {
        var c = chunk.charCodeAt(position);
        if (this.state === AFTER_CR && c === "\n".charCodeAt(0)) {
          this.state = FIELD_START;
        } else {
          if (this.state === AFTER_CR) {
            this.state = FIELD_START;
          }
          if (c === "\r".charCodeAt(0) || c === "\n".charCodeAt(0)) {
            if (this.state !== FIELD_START) {
              if (this.state === FIELD) {
                this.valueStart = position + 1;
              }
              var field = chunk.slice(this.fieldStart, this.valueStart - 1);
              var value = chunk.slice(this.valueStart + (this.valueStart < position && chunk.charCodeAt(this.valueStart) === " ".charCodeAt(0) ? 1 : 0), position);
              if (field === "data") {
                this.dataBuffer.push(value);
              } else if (field === "id") {
                this.lastEventIdBuffer = value;
              } else if (field === "event") {
                this.eventTypeBuffer = value;
              } else if (field === "retry") {
                this.initialRetry = getDuration(Number(value), this.initialRetry);
                this.retry = this.initialRetry;
              } else if (field === "heartbeatTimeout") {
                this.heartbeatTimeout = getDuration(Number(value), this.heartbeatTimeout);
                if (this.timeout !== 0) {
                  clearTimeout(this.timeout);
                  var that = this;
                  this.timeout = setTimeout(function () {
                    that.onTimeout();
                  }, this.heartbeatTimeout);
                }
              }
            }
            if (this.state === FIELD_START) {
              if (this.dataBuffer.length !== 0) {
                this.lastEventId = this.lastEventIdBuffer;
                if (this.eventTypeBuffer === "") {
                  this.eventTypeBuffer = "message";
                }
                var event = new MessageEvent(this.eventTypeBuffer, {
                  data: this.dataBuffer.join("\n"),
                  lastEventId: this.lastEventIdBuffer
                });
                this.es.dispatchEvent(event);
                if (this.eventTypeBuffer === "message") {
                  fire(this.es, this.es.onmessage, event);
                }
                if (this.currentState === CLOSED) {
                  return;
                }
              }
              this.dataBuffer.length = 0;
              this.eventTypeBuffer = "";
            }
            this.state = c === "\r".charCodeAt(0) ? AFTER_CR : FIELD_START;
          } else {
            if (this.state === FIELD_START) {
              this.fieldStart = position;
              this.state = FIELD;
            }
            if (this.state === FIELD) {
              if (c === ":".charCodeAt(0)) {
                this.valueStart = position + 1;
                this.state = VALUE_START;
              }
            } else if (this.state === VALUE_START) {
              this.state = VALUE;
            }
          }
        }
      }
    }
  };

  EventSourceInternal.prototype.onFinish = function () {
    if (this.currentState === OPEN || this.currentState === CONNECTING) {
      this.currentState = WAITING;
      if (this.timeout !== 0) {
        clearTimeout(this.timeout);
        this.timeout = 0;
      }
      if (this.retry > this.initialRetry * 16) {
        this.retry = this.initialRetry * 16;
      }
      if (this.retry > MAXIMUM_DURATION) {
        this.retry = MAXIMUM_DURATION;
      }
      var that = this;
      this.timeout = setTimeout(function () {
        that.onTimeout();
      }, this.retry);
      this.retry = this.retry * 2 + 1;

      this.readyState = CONNECTING;
      this.es.readyState = CONNECTING;
      var event = new Event("error");
      this.es.dispatchEvent(event);
      fire(this.es, this.es.onerror, event);
    }
  };

  EventSourceInternal.prototype.onTimeout = function () {
    this.timeout = 0;

    if (this.currentState === WAITING) {
      // loading indicator in Safari < ? (6), Chrome < 14, Firefox
      if (XMLHttpRequest != undefined &&
          !("ontimeout" in XMLHttpRequest.prototype) &&
          global.document != undefined &&
          global.document.readyState != undefined &&
          global.document.readyState !== "complete") {
        var that = this;
        this.timeout = setTimeout(function () {
          that.onTimeout();
        }, 4);
        return;
      }
    }

    if (this.currentState !== WAITING) {
      if (!this.wasActivity) {
        throwError(new Error("No activity within " + this.heartbeatTimeout + " milliseconds. Reconnecting."));
        this.transport.cancel();
      } else {
        this.wasActivity = false;
        var that = this;
        this.timeout = setTimeout(function () {
          that.onTimeout();
        }, this.heartbeatTimeout);
      }
      return;
    }

    this.wasActivity = false;
    var that = this;
    this.timeout = setTimeout(function () {
      that.onTimeout();
    }, this.heartbeatTimeout);

    this.currentState = CONNECTING;
    this.dataBuffer.length = 0;
    this.eventTypeBuffer = "";
    this.lastEventIdBuffer = this.lastEventId;
    this.textBuffer = "";
    this.fieldStart = 0;
    this.valueStart = 0;
    this.state = FIELD_START;

    // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
    // "Cache-control: no-cache" are not honored in Chrome and Firefox
    // https://bugzilla.mozilla.org/show_bug.cgi?id=428916
    // Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
    var url = this.url;
    if (this.url.slice(0, 5) !== "data:" &&
        this.url.slice(0, 5) !== "blob:") {
      url = this.url + ((this.url.indexOf("?", 0) === -1 ? "?" : "&") + "lastEventId=" + encodeURIComponent(this.lastEventId) + "&r=" + (Math.random() + 1).toString().slice(2));
    }
    var headers = {};
    headers["Accept"] = "text/event-stream";
    if (this.headers != undefined) {
      for (var name in this.headers) {
        if (Object.prototype.hasOwnProperty.call(this.headers, name)) {
          headers[name] = this.headers[name];
        }
      }
    }
    try {
      this.transport.open(this.onStart, this.onProgress, this.onFinish, this, url, this.withCredentials, headers);
    } catch (error) {
      this.close();
      throw error;
    }
  };

  EventSourceInternal.prototype.close = function () {
    this.currentState = CLOSED;
    this.transport.cancel();
    if (this.timeout !== 0) {
      clearTimeout(this.timeout);
      this.timeout = 0;
    }
    this.readyState = CLOSED;
    this.es.readyState = CLOSED;
  };

  function F() {
    this.CONNECTING = CONNECTING;
    this.OPEN = OPEN;
    this.CLOSED = CLOSED;
  }
  F.prototype = EventTarget.prototype;

  EventSourcePolyfill.prototype = new F();

  EventSourcePolyfill.prototype.close = function () {
    this._internal.close();
  };

  F.call(EventSourcePolyfill);
  if (isCORSSupported) {
    EventSourcePolyfill.prototype.withCredentials = undefined;
  }

  var isEventSourceSupported = function () {
    // Opera 12 fails this test, but this is fine.
    return NativeEventSource != undefined && ("withCredentials" in NativeEventSource.prototype);
  };

  global.EventSourcePolyfill = EventSourcePolyfill;
  global.NativeEventSource = NativeEventSource;

  if (Transport != undefined && (NativeEventSource == undefined || (isCORSSupported && !isEventSourceSupported()))) {
    // Why replace a native EventSource ?
    // https://bugzilla.mozilla.org/show_bug.cgi?id=444328
    // https://bugzilla.mozilla.org/show_bug.cgi?id=831392
    // https://code.google.com/p/chromium/issues/detail?id=260144
    // https://code.google.com/p/chromium/issues/detail?id=225654
    // ...
    global.EventSource = EventSourcePolyfill;
  }

}(typeof window !== 'undefined' ? window : this));
