/*jslint indent: 2 */
/*global setTimeout, clearTimeout */

(function (global) {

  function EventTarget() {
    var listeners = [];

    function lastIndexOf(type, callback) {
      var i = listeners.length - 1;
      while (i >= 0 && !(listeners[i].type === type && listeners[i].callback === callback)) {
        i -= 1;
      }
      return i;
    }

    this.dispatchEvent = function (event) {
      function a(e) {
        return function () {
          throw e;
        };
      }

      var type = event.type,
        candidates = listeners.slice(0),
        i;
      for (i = 0; i < candidates.length; i += 1) {
        if (candidates[i].type === type) {
          try {
            candidates[i].callback.call(this, event);
          } catch (e) {
            // This identifier is local to the catch clause. But it's not true for IE < 9 ? (so "a" used)
            setTimeout(a(e), 0);
          }
        }
      }
    };

    this.addEventListener = function (type, callback) {
      if (lastIndexOf(type, callback) === -1) {
        listeners.push({type: type, callback: callback});
      }
    };

    this.removeEventListener = function (type, callback) {
      var i = lastIndexOf(type, callback);
      if (i !== -1) {
        listeners.splice(i, 1);
      }
    };

    return this;
  }

  function empty() {}

  var Transport = null,
    isOpera = Object.prototype.toString.call(global.opera) === '[object Opera]',
    supportCORS = true, // anonymous mode at least
    tmp = global.XMLHttpRequest && (new global.XMLHttpRequest()),
    nativeProgress = (tmp && ('onprogress' in tmp)),
    progress = isOpera || nativeProgress,
    withCredentials = tmp && ('withCredentials' in tmp);
  tmp = null;

  function EventSource(url, options) {
    function F() {}
    F.prototype = EventSource.prototype;

    url = String(url);

    var that = new F(),
      retry = 1000,
      lastEventId = '',
      xhr = null,
      reconnectTimeout = null,
      checkTimeout = null,
      stop;

    that.url = url;
    that.withCredentials = !!(options && options.withCredentials && withCredentials);

    that.CONNECTING = 0;
    that.OPEN = 1;
    that.CLOSED = 2;
    that.readyState = that.CONNECTING;

    // Queue a task which, if the readyState is set to a value other than CLOSED,
    // sets the readyState to ... and fires event
    function queue(event, readyState) {
      setTimeout(function () {
        if (that.readyState !== that.CLOSED) { // http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
          if (readyState !== null) {
            that.readyState = readyState;
          }

          event.target = that;
          that.dispatchEvent(event);
          if (/^(message|error|open)$/.test(event.type) && typeof that['on' + event.type] === 'function') {
            // as IE doesn't support getters/setters, we can't implement 'onmessage' via addEventListener/removeEventListener
            that['on' + event.type](event);
          }
        }
      }, 0);
    }

    function close() {
      // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
      if (xhr !== null) {
        stop();
        xhr.abort();
        xhr = null;
      }
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      that.readyState = that.CLOSED;
    }

    stop = function () {
      if (checkTimeout !== null) {
        clearTimeout(checkTimeout);
        checkTimeout = null;
      }
      if ('\v' === 'v' && global.detachEvent) {
        global.detachEvent('onunload', close);
      }
      xhr.onload = xhr.onerror = xhr.onprogress = xhr.onreadystatechange = empty;
    };

    that.close = close;

    EventTarget.call(that);

    function openConnection() {
      reconnectTimeout = null;
      if ('\v' === 'v' && global.attachEvent) {
        global.attachEvent('onunload', close);
      }

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

      function onReadyStateChange(readyState) {
        if (!xhr) {//? strange Opera error
          return;
        }

        var responseText = '',
          contentType = '',
          i,
          j,
          part,
          stream,
          field,
          value;

        // Opera doesn't fire several readystatechange events while chunked data is coming in
        // see http://stackoverflow.com/questions/2657450/how-does-gmail-do-comet-on-opera
        if (checkTimeout === null && !nativeProgress && readyState === 3) {
          (function loop() {
            checkTimeout = setTimeout(function () {
              onReadyStateChange(+xhr.readyState);
              loop();
            }, 250);
          }());
        }

        try {
          contentType = readyState > 1 ? ((xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') : xhr.contentType) || '') : '';
          responseText = readyState > 2 ? xhr.responseText || '' : '';
        } catch (e) {}

        if (!opened && (/^text\/event\-stream/i).test(contentType)) {
          queue({type: 'open'}, that.OPEN);
          opened = true;
        }

        if (opened && (/\r|\n/).test(responseText.slice(charOffset))) {
          part = responseText.slice(offset);
          stream = (offset ? part : part.replace(/^\uFEFF/, '')).replace(/\r\n?/g, '\n').split('\n');

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

        if (readyState === 4) {
          stop();
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
        }
      }

      if (xhr.setRequestHeader) { // XDomainRequest doesn't have this method
        // Chrome bug:
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader('Cache-Control', 'no-cache');

        // Chrome bug:
        // http://code.google.com/p/chromium/issues/detail?id=71694
        // If you force Chrome to have a whitelisted content-type, either explicitly with setRequestHeader(), or implicitly by sending a FormData, then no preflight is done.
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

        if (!progress) {
          //! X-Requested-With header should be allowed for CORS requests
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');// long-polling
        }

        //  Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        //if (lastEventId !== '') {
        //  xhr.setRequestHeader('Last-Event-ID', lastEventId);
        //}
        xhr.onreadystatechange = function () {
          onReadyStateChange(+xhr.readyState);
        };

        xhr.withCredentials = that.withCredentials;
      }
      xhr.onload = xhr.onerror = function () {
        onReadyStateChange(4);
      };
      // onprogress fires multiple times while readyState === 3
      xhr.onprogress = function () {
        onReadyStateChange(3);
      };

      xhr.send(lastEventId !== '' ? 'Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
    }
    openConnection();

    return that;
  }

  EventSource.CONNECTING = 0;
  EventSource.OPEN = 1;
  EventSource.CLOSED = 2;

  if (!(global.EventSource && global.EventSource.constructor && global.EventSource.constructor.length > 1)) {
    if (progress && withCredentials) {
      Transport = global.XMLHttpRequest;
    } else {
      if (global.XDomainRequest) {
        // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
        // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
        // http://cometdaily.com/2008/page/3/
        Transport = global.XDomainRequest;
        nativeProgress = true;
      } else {
        if (!isOpera && global.EventSource) {
          supportCORS = false;
        } else {
          supportCORS = withCredentials;
          Transport = global.XMLHttpRequest || function () {
            return (new global.ActiveXObject('Microsoft.XMLHTTP'));
          };
        }
      }
    }
  }

  if (Transport) {
    global.EventSource = EventSource;
  }

  global.EventSource.supportCORS = supportCORS;

}(this));
