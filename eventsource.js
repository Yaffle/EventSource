/*jslint sloppy: true, white: true, plusplus: true, indent: 2 */
/*global XMLHttpRequest, setTimeout, clearTimeout, XDomainRequest*/

(function (global) {

  // http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1#comments
  // XDomainRequest does not have a binary interface. To use with non-text, first base64 to string.
  // http://cometdaily.com/2008/page/3/
  function XDomainRequestWrapper() {
    var x = new global.XDomainRequest(),
      that = this;

    that.readyState = 0;
    that.responseText = '';

    function onChange(readyState, responseText) {
      that.readyState = readyState;
      that.responseText = responseText;
      that.onreadystatechange();
    }

    x.onload = function () {
      onChange(4, x.responseText);
    };

    x.onerror = function () {
      onChange(4, '');
    };

    x.onprogress = function () {
      onChange(3, x.responseText);
    };

    that.open = function (method, url) {
      return x.open(method, url);
    };

    that.abort = function () {
      return x.abort();
    };

    that.send = function (postData) {
      return x.send(postData);
    };

    that.setRequestHeader = function () {};

    that.getResponseHeader = function (name) {
      return (/^content\-type$/i).test(name) ? x.contentType : '';
    };

    return that;
  }

  function extendAsEventTarget(obj) {
    var listeners = [];

    function lastIndexOf(type, callback) {
      var i = listeners.length - 1;
      while (i >= 0 && !(listeners[i].type === type && listeners[i].callback === callback)) {
        i--;
      }
      return i;
    }

    obj.dispatchEvent = function (eventObject) {
      function a(e) {
        return function () {
          throw e;
        };
      }

      var type = eventObject.type,
          candidates = listeners.slice(0), i;
      for (i = 0; i < candidates.length; i++) {
        if (candidates[i].type === type) {
          try {
            candidates[i].callback.call(obj, eventObject);
          } catch (e) {
            // This identifier is local to the catch clause. But it's not true for IE < 9 ? (so "a" used)
            setTimeout(a(e), 0);
          }
        }
      }
    };

    obj.addEventListener = function (type, callback) {
      if (lastIndexOf(type, callback) === -1) {
        listeners.push({type: type, callback: callback});
      }
    };

    obj.removeEventListener = function (type, callback) {
      var i = lastIndexOf(type, callback);
      if (i !== -1) {
        listeners.splice(i, 1);
      }
    };

    return obj;
  }

  function empty() {}

  var Transport,
    supportCORS = false; // anonymous mode at least

  if (global.EventSource && global.EventSource.constructor && global.EventSource.constructor.length > 1) {
    Transport = null;
    supportCORS = true;
  } else {
    if (global.XMLHttpRequest && ('onprogress' in (new XMLHttpRequest())) && ('withCredentials' in (new XMLHttpRequest()))) {
      Transport = global.XMLHttpRequest;
      supportCORS = true;
    } else {
      if (global.XDomainRequest) {
        Transport = XDomainRequestWrapper;
        supportCORS = true;
      } else {
        if (global.EventSource) {
          Transport = null;
        } else {
          if (global.XMLHttpRequest) {
            Transport = global.XMLHttpRequest;
            supportCORS = ('withCredentials' in (new XMLHttpRequest()));
          } else {
            Transport = function () { 
              return (new global.ActiveXObject('Microsoft.XMLHTTP'));
            };
          }
        }
      }
    }
  }

  if (Transport) {
    global.EventSource = function (url, options) {
      function F() {}
      F.prototype = global.EventSource.prototype;

      url = String(url);

      var that = new F(),
        retry = 1000,
        lastEventId = '',
        xhr = null,
        reconnectTimeout = null,
        realReadyState;

      that.url = url;
      that.withCredentials = !!(options && options.withCredentials && ('withCredentials' in (new Transport())));

      that.CONNECTING = 0;
      that.OPEN = 1;
      that.CLOSED = 2;
      that.readyState = that.CONNECTING;
      realReadyState = that.CONNECTING;

      // Queue a task which, if the readyState is set to a value other than CLOSED,
      // sets the readyState to ... and fires event
      function queue(event, readyState) {
        if (readyState !== null) {
          realReadyState = readyState;
        }
        setTimeout(function () {
          if (that.readyState === that.CLOSED) {
            return;// http://www.w3.org/Bugs/Public/show_bug.cgi?id=14331
          }
          if (readyState !== null) {
            that.readyState = readyState;
          }

          event.target = that;
          that.dispatchEvent(event);
          try {
            if (/^(message|error|open)$/.test(event.type) && typeof that['on' + event.type] === 'function') {
              // as IE doesn't support getters/setters, we can't implement 'onmessage' via addEventListener/removeEventListener
              that['on' + event.type](event);
            }
          } catch (e) {
            setTimeout(function () {
              throw e;
            }, 0);
          }
        }, 0);
      }

      function close() {
        // http://dev.w3.org/html5/eventsource/ The close() method must close the connection, if any; must abort any instances of the fetch algorithm started for this EventSource object; and must set the readyState attribute to CLOSED.
        if (xhr !== null) {
          xhr.onreadystatechange = empty;
          xhr.abort();
          xhr = null;
        }
        if (reconnectTimeout !== null) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        if ('\v' === 'v' && global.detachEvent) {
          global.detachEvent('onunload', close);
        }
        that.readyState = that.CLOSED;
        realReadyState = that.CLOSED;
      }

      that.close = close;

      extendAsEventTarget(that);

      function openConnection() {
        reconnectTimeout = null;
        if ('\v' === 'v' && global.attachEvent) {
          global.attachEvent('onunload', close);
        }

        var offset = 0,
          charOffset = 0,
          buffer = {
            data: '',
            lastEventId: lastEventId,
            name: ''
          };

        xhr = new Transport();

        // with GET method in FF xhr.onreadystatechange with readyState === 3 doesn't work + POST = no-cache
        xhr.open('POST', url, true);

        // Chrome bug:
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader('Cache-Control', 'no-cache');

        // Chrome bug:
        // http://code.google.com/p/chromium/issues/detail?id=71694
        // If you force Chrome to have a whitelisted content-type, either explicitly with setRequestHeader(), or implicitly by sending a FormData, then no preflight is done.
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

        if (!('onprogress' in xhr)) {
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');// long-polling
        }

        //  Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        //if (lastEventId !== '') {
        //  xhr.setRequestHeader('Last-Event-ID', lastEventId);
        //}

        xhr.withCredentials = that.withCredentials;

        xhr.onreadystatechange = function () {
          var readyState = +xhr.readyState,
            responseText = '',
            contentType = '',
            i,
            j,
            part,
            stream,
            field,
            value;

          try {
            contentType = readyState > 1 ? (xhr.getResponseHeader ? xhr.getResponseHeader('Content-Type') || '' : xhr.contentType) : '';
            responseText = readyState > 2 ? xhr.responseText || '' : '';
          } catch (e) {}

          if (realReadyState === that.CONNECTING && /^text\/event\-stream/i.test(contentType)) {
            queue({'type': 'open'}, that.OPEN);
          }

          if (realReadyState === that.OPEN && /\r|\n/.test(responseText.slice(charOffset))) {
            part = responseText.slice(offset);
            stream = (offset ? part : part.replace(/^\uFEFF/, '')).replace(/\r\n?/g, '\n').split('\n');

            offset += part.length - stream[stream.length - 1].length;
            for (i = 0; i < stream.length - 1; i++) {
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
                    'type': buffer.name || 'message',
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
            xhr.onreadystatechange = empty;// old IE bug?
            xhr = null;
            if ('\v' === 'v' && global.detachEvent) {
              global.detachEvent('onunload', close);
            }
            if (realReadyState === that.OPEN) {
              // reestablishes the connection
              queue({'type': 'error'}, that.CONNECTING);
              // setTimeout will wait before previous setTimeout(0) have completed
              reconnectTimeout = setTimeout(openConnection, retry);
            } else {
              //fail the connection
              queue({'type': 'error'}, that.CLOSED);
            }
          }
        };
        xhr.send(lastEventId !== '' ? 'Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
      }
      openConnection();

      return that;
    };

    global.EventSource.CONNECTING = 0;
    global.EventSource.OPEN = 1;
    global.EventSource.CLOSED = 2;
  }

  global.EventSource.supportCORS = supportCORS;

}(this));
