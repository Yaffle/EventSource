/*jslint indent: 2 */
/*global setTimeout, clearTimeout */

(function (global) {
  "use strict";

  function EventTarget() {
    return this;
  }

  EventTarget.prototype = {
    nextListener: null,
    throwError: function (e) {
      setTimeout(function () {
        throw e;
      }, 0);
    },
    invokeEvent: function (event) {
      var type = String(event.type),
        i = this.nextListener,
        phase = event.eventPhase,
        candidates = {
          next: null
        },
        j = candidates;
      while (i) {
        if (i.type === type && !(phase === 1 && !i.capture) && !(phase === 3 && i.capture)) {
          j = j.next = {
            callback: i.callback,
            next: null
          };
        }
        i = i.nextListener;
      }
      j = candidates.next;
      while (j) {
        event.currentTarget = this;
        try {
          j.callback.call(this, event);
        } catch (e) {
          this.throwError(e);
        }
        event.currentTarget = null;
        j = j.next;
      }
    },
    dispatchEvent: function (event) {
      event.eventPhase = 2;
      this.invokeEvent(event);
    },
    addEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listener = this,
        i = listener.nextListener;
      while (i) {
        if (i.type === type && i.callback === callback && i.capture === capture) {
          return;
        }
        listener = i;
        i = i.nextListener;
      }
      listener.nextListener = {
        nextListener: null,
        type: type,
        callback: callback,
        capture: capture
      };
    },
    removeEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listener = this,
        i = listener.nextListener;
      while (i) {
        if (i.type === type && i.callback === callback && i.capture === capture) {
          listener.nextListener = i.nextListener;
          return;
        }
        listener = i;
        i = i.nextListener;
      }
    }
  };

  // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
  // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
  // http://cometdaily.com/2008/page/3/

  var XHR = global.XMLHttpRequest,
    xhr2 = XHR && global.ProgressEvent && ((new XHR()).withCredentials !== undefined),
    Transport = xhr2 ? XHR : global.XDomainRequest,
    CONNECTING = 0,
    OPEN = 1,
    CLOSED = 2,
    proto;

  function empty() {}

  function EventSource(url, options) {
    url = String(url);

    var that = this,
      retry = 1000,
      retry2 = retry,
      heartbeatTimeout = 45000,
      xhrTimeout = null,
      wasActivity = false,
      lastEventId = '',
      xhr = new Transport(),
      reconnectTimeout = null,
      withCredentials = Boolean(xhr2 && options && options.withCredentials),
      offset,
      charOffset,
      opened,
      buffer = {
        data: '',
        lastEventId: '',
        name: ''
      },
      tail = {
        next: null,
        event: null,
        readyState: null
      },
      head = tail,
      channel = null;

    options = null;
    that.url = url;

    that.readyState = CONNECTING;
    that.withCredentials = withCredentials;

    // Queue a task which, if the readyState is set to a value other than CLOSED,
    // sets the readyState to ... and fires event

    function onTimeout() {
      var event = head.event,
        readyState = head.readyState,
        type = String(event.type);
      head = head.next;

      if (that.readyState !== CLOSED) { // http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
        if (readyState !== null) {
          that.readyState = readyState;
        }

        if (readyState === CONNECTING) {
          // setTimeout will wait before previous setTimeout(0) have completed
          retry2 = Math.min(retry2, 86400000);
          reconnectTimeout = setTimeout(openConnection, retry2);
          retry2 = retry2 * 2 + 1;
        }

        event.target = that;
        that.dispatchEvent(event);

        if (/^(message|error|open)$/.test(type) && typeof that['on' + type] === 'function') {
          // as IE 8 doesn't support getters/setters, we can't implement 'onmessage' via addEventListener/removeEventListener
          that['on' + type](event);
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
      tail = tail.next = {
        next: null,
        event: null,
        readyState: null
      };
      if (channel) {
        channel.port2.postMessage('');
      } else {
        setTimeout(onTimeout, 0);
      }
    }

    function close() {
      // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
      if (xhr !== null) {
        xhr.onload = xhr.onerror = xhr.onprogress = xhr.onreadystatechange = empty;
        xhr.abort();
        xhr = null;
      }
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (xhrTimeout !== null) {
        clearTimeout(xhrTimeout);
        xhrTimeout = null;
      }
      that.readyState = CLOSED;
    }

    that.close = close;

    EventTarget.call(that);

    function onXHRTimeout() {
      xhrTimeout = null;
      if (wasActivity) {
        wasActivity = false;
        xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);
      } else {
        xhr.onload = xhr.onerror = xhr.onprogress = empty;
        xhr.abort();
        onError.call(xhr);
      }
    }

    function onProgress() {
      var responseText = xhr.responseText || '',
        contentType,
        i,
        j,
        part,
        stream,
        field,
        value;

      wasActivity = true;

      if (!opened) {
        try {
          contentType = xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') : xhr.contentType;
        } catch (error) {
          // invalid state error when xhr.getResponseHeader called after xhr.abort in Chrome 18
          setTimeout(function () {
            throw error;
          }, 0);
        }
        if (contentType && (/^text\/event\-stream/i).test(contentType)) {
          queue({type: 'open'}, OPEN);
          opened = true;
          retry2 = retry;
        }
      }

      if (opened && (/\r|\n/).test(responseText.slice(charOffset))) {
        part = responseText.slice(offset);
        stream = part.replace(/\r\n?/g, '\n').split('\n');

        offset += part.length - stream[stream.length - 1].length;
        for (i = 0; i < stream.length - 1; i += 1) {
          field = stream[i];
          value = '';
          j = field.indexOf(':');
          if (j !== -1) {
            value = field.slice(j + (field.charAt(j + 1) === ' ' ? 2 : 1));
            field = field.slice(0, j);
          }

          if (!stream[i]) {
            // dispatch the event
            if (buffer.data) {
              lastEventId = buffer.lastEventId;
              queue({
                type: buffer.name || 'message',
                lastEventId: lastEventId,
                data: buffer.data.replace(/\n$/, '')
              }, null);
            }
            // Set the data buffer and the event name buffer to the empty string.
            buffer.data = '';
            buffer.name = '';
          }

          if (field === 'event') {
            buffer.name = value;
          }

          if (field === 'id') {
            buffer.lastEventId = value; // see http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761
          }

          if (field === 'retry') {
            if (/^\d+$/.test(value)) {
              retry = Number(value);
              retry2 = retry;
            }
          }

          if (field === 'heartbeatTimeout') {//!
            heartbeatTimeout = Math.min(Math.max(1, Number(value) || 0), 86400000);
            if (xhrTimeout !== null) {
              clearTimeout(xhrTimeout);
              xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);
            }
          }

          if (field === 'data') {
            buffer.data += value + '\n';
          }
        }
      }
      charOffset = responseText.length;
    }

    function onError() {
      onProgress();
      //if (opened) {
        // reestablishes the connection
      queue({type: 'error'}, CONNECTING);
      //} else {
        // fail the connection
      //  queue({type: 'error'}, CLOSED);
      //}
      if (xhrTimeout !== null) {
        clearTimeout(xhrTimeout);
        xhrTimeout = null;
      }
    }

    function onReadyStateChange() {
      if (xhr.readyState === 3) {
        onProgress();
      }
    }

    function openConnection() {
      // XDomainRequest#abort removes onprogress, onerror, onload

      xhr.onload = xhr.onerror = onError;

      // onprogress fires multiple times while readyState === 3
      // onprogress should be setted before calling "open" for Firefox 3.6
      xhr.onprogress = onProgress;

      // Firefox 3.6
      xhr.onreadystatechange = onReadyStateChange;

      reconnectTimeout = null;
      wasActivity = false;
      xhrTimeout = setTimeout(onXHRTimeout, heartbeatTimeout);

      offset = 0;
      charOffset = 0;
      opened = false;
      buffer.data = '';
      buffer.name = '';
      buffer.lastEventId = lastEventId;//resets to last successful

      // with GET method in FF xhr.onreadystatechange with readyState === 3 doesn't work + POST = no-cache
      xhr.open('POST', url, true);

      // withCredentials should be setted after "open" for Safari and Chrome (< 19 ?)
      xhr.withCredentials = withCredentials;

      if (xhr.setRequestHeader) { // !XDomainRequest
        // http://dvcs.w3.org/hg/cors/raw-file/tip/Overview.html
        // Cache-Control is not a simple header
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader('Cache-Control', 'no-cache');

        // Chrome bug:
        // http://code.google.com/p/chromium/issues/detail?id=71694
        // If you force Chrome to have a whitelisted content-type, either explicitly with setRequestHeader(), or implicitly by sending a FormData, then no preflight is done.
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        xhr.setRequestHeader('Accept', 'text/event-stream');

        // Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        // +setRequestHeader shouldn't be used to avoid preflight requests
        //if (lastEventId !== '') {
        //  xhr.setRequestHeader('Last-Event-ID', lastEventId);
        //}
      }
      xhr.send(lastEventId !== '' ? 'Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
    }

    openConnection();

    return that;
  }

  proto = new EventTarget();
  proto.CONNECTING = CONNECTING;
  proto.OPEN = OPEN;
  proto.CLOSED = CLOSED;

  EventSource.prototype = proto;
  EventSource.CONNECTING = CONNECTING;
  EventSource.OPEN = OPEN;
  EventSource.CLOSED = CLOSED;
  proto = null;

  if (Transport) {
    global.EventSource = EventSource;
  }

}(this));
