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
        candidates = this.listeners,
        length = candidates.length,
        i;
      for (i = 0; i < length; i += 1) {
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
        length = listeners.length,
        m = [],
        i,
        x;
      for (i = 0; i < length; i += 1) {
        x = listeners[i];
        if (!(x.type === type && x.callback === callback && x.capture === capture)) {
          m.push(x);
        }
      }
      this.listeners = m;
    }
  };

  // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
  // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
  // http://cometdaily.com/2008/page/3/

  var xhr2 = global.XMLHttpRequest && ('withCredentials' in (new global.XMLHttpRequest())) && !!global.ProgressEvent,
    Transport = xhr2 ? global.XMLHttpRequest : global.XDomainRequest,
    CONNECTING = 0,
    OPEN = 1,
    CLOSED = 2,
    proto;

  function EventSource(url, options) {
    url = String(url);

    var that = this,
      retry = 1000,
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
      };

    options = null;
    that.url = url;

    that.readyState = CONNECTING;
    that.withCredentials = withCredentials;

    // Queue a task which, if the readyState is set to a value other than CLOSED,
    // sets the readyState to ... and fires event
    function queue(event, readyState) {
      setTimeout(function () {
        if (that.readyState !== CLOSED) { // http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
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
        xhr.onload = xhr.onerror = xhr.onprogress = xhr.onreadystatechange = function () {};
        xhr.abort();
        xhr = null;
      }
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      that.readyState = CLOSED;
    }

    that.close = close;

    EventTarget.call(that);

    function onProgress() {
      var responseText = xhr.responseText || '',
        contentType,
        i,
        j,
        part,
        stream,
        field,
        value;

      if (!opened) {
        contentType = xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') : xhr.contentType;
        if (contentType && (/^text\/event\-stream/i).test(contentType)) {
          queue({type: 'open'}, OPEN);
          opened = true;
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

    function openConnection() {
      reconnectTimeout = null;

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

    xhr.onload = xhr.onerror = function () {
      onProgress();
      if (opened) {
        // reestablishes the connection
        queue({type: 'error'}, CONNECTING);
        // setTimeout will wait before previous setTimeout(0) have completed
        reconnectTimeout = setTimeout(openConnection, retry);
      } else {
        // fail the connection
        queue({type: 'error'}, CLOSED);
      }
    };

    // onprogress fires multiple times while readyState === 3
    // onprogress should be setted before calling "open" for Firefox 3.6
    xhr.onprogress = onProgress;

    // Firefox 3.6
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 3) {
        onProgress();
      }
    };

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

  //if (!('withCredentials' in global.EventSource.prototype)) { // to detect CORS in FF 11
  if (Transport) {
    global.EventSource = EventSource;
  }
  //}

}(this));
