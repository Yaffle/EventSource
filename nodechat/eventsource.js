/*jslint indent: 2 */
/*global setTimeout, clearTimeout */

(function (global) {

  function EventTarget() {
    this.listeners = [];
    return this;
  }

  EventTarget.prototype = {
    dispatchEvent: function (event) {
      function a(x, type, event) {
        if (x.type === type) {
          event.currentTarget = this;
          event.eventPhase = 2;
          try {
            x.callback.call(this, event);
          } catch (e) {
            setTimeout(function () {
              throw e;
            }, 0);
          }
          event.currentTarget = null;
          event.eventPhase = 2;
        }
      }
      var type = String(event.type),
        candidates = this.listeners.slice(0),
        i;
      for (i = 0; i < candidates.length; i += 1) {
        a.call(this, candidates[i], type, event);
      }
    },
    addEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listeners = this.listeners,
        i = listeners.length - 1,
        x;
      while (i >= 0) {
        x = listeners[i];
        if (x.type === type && x.callback === callback && x.capture === capture) {
          return;
        }
        i -= 1;
      }
      listeners.push({type: type, callback: callback, capture: capture});
    },
    removeEventListener: function (type, callback, capture) {
      type = String(type);
      capture = Boolean(capture);
      var listeners = this.listeners,
        i = listeners.length - 1,
        x;
      while (i >= 0) {
        x = listeners[i];
        if (x.type === type && x.callback === callback && x.capture === capture) {
          listeners.splice(i, 1);
          return;
        }
        i -= 1;
      }
    }
  };

  // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
  // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
  // http://cometdaily.com/2008/page/3/

  var xhr2 = global.XMLHttpRequest && ('withCredentials' in (new global.XMLHttpRequest())) && !!global.ProgressEvent,
    Transport = xhr2 ? global.XMLHttpRequest : global.XDomainRequest;

  function EventSource(url, options) {
    url = String(url);

    var that = this,
      retry = 1000,
      lastEventId = '',
      xhr = null,
      reconnectTimeout = null,
      withCredentials = Boolean(xhr2 && options && options.withCredentials);

    options = null;
    that.url = url;

    that.readyState = that.CONNECTING;
    that.withCredentials = withCredentials;

    // Queue a task which, if the readyState is set to a value other than CLOSED,
    // sets the readyState to ... and fires event
    function queue(event, readyState) {
      setTimeout(function () {
        if (that.readyState !== that.CLOSED) { // http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
          if (readyState !== null) {
            that.readyState = readyState;
          }

          var type = String(event.type);
          event.target = that;
          that.dispatchEvent(event);

          if (/^(message|error|open)$/.test(type) && typeof that['on' + type] === 'function') {
            // as IE 8 doesn't support getters/setters, we can't implement 'onmessage' via addEventListener/removeEventListener
            that['on' + type](event);
          }
        }
      }, 0);
    }

    function close() {
      // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
      if (xhr !== null) {
        xhr.onload = xhr.onerror = xhr.onprogress = function () {};
        xhr.abort();
        xhr = null;
      }
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      that.readyState = that.CLOSED;
    }

    that.close = close;

    EventTarget.call(that);

    function openConnection() {
      reconnectTimeout = null;

      var offset = 0,
        charOffset = 0,
        opened = false,
        buffer = {
          data: '',
          lastEventId: lastEventId,
          name: ''
        };

      xhr = new Transport();

      // with GET method in FF xhr.onreadystatechange with readyState === 3 doesn't work + POST = no-cache
      xhr.open('POST', url, true);

      function onProgress() {
        var responseText = '',
          contentType = '',
          i,
          j,
          part,
          stream,
          field,
          value;

        try {
          if (!opened) {
            contentType = (xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') : xhr.contentType) || '';
          }
          responseText = xhr.responseText || '';
        } catch (e) {}

        if (!opened && (/^text\/event\-stream/i).test(contentType)) {
          queue({type: 'open'}, that.OPEN);
          opened = true;
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
                retry = +value;
              }
            }

            if (field === 'data') {
              buffer.data += value + '\n';
            }
          }
        }
        charOffset = responseText.length;
      }

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

      xhr.withCredentials = withCredentials;

      xhr.onload = xhr.onerror = function () {
        onProgress();
        xhr.onload = xhr.onerror = xhr.onprogress = function () {};
        xhr = null;
        if (opened) {
          // reestablishes the connection
          queue({type: 'error'}, that.CONNECTING);
          // setTimeout will wait before previous setTimeout(0) have completed
          reconnectTimeout = setTimeout(openConnection, retry);
        } else {
          // fail the connection
          queue({type: 'error'}, that.CLOSED);
        }
      };

      // onprogress fires multiple times while readyState === 3
      xhr.onprogress = onProgress;

      xhr.send(lastEventId !== '' ? 'Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
    }
    openConnection();

    return that;
  }

  EventSource.CONNECTING = 0;
  EventSource.OPEN = 1;
  EventSource.CLOSED = 2;

  EventSource.prototype = new EventTarget();
  EventSource.prototype.CONNECTING = EventSource.CONNECTING;
  EventSource.prototype.OPEN = EventSource.OPEN;
  EventSource.prototype.CLOSED = EventSource.CLOSED;

  //if (!('withCredentials' in global.EventSource.prototype)) { // to detect CORS in FF 11
  if (Transport) {
    global.EventSource = EventSource;
  }
  //}

}(this));
