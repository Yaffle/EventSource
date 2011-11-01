/*jslint sloppy: true, white: true, plusplus: true, indent: 2, regexp: true */
/*global XMLHttpRequest, setTimeout, clearTimeout, XDomainRequest, ActiveXObject*/

(function (global) {

  function parseURI(url) {
    var m = String(url).replace(/^\s+|\s+$/g, '').match(/^([^:\/?#]+:)?(\/\/(?:[^:@]*(?::[^:@]*)?@)?(([^:\/?#]*)(?::(\d*))?))?([^?#]*)(\?[^#]*)?(#[\s\S]*)?/);
    // authority = '//' + user + ':' + pass '@' + hostname + ':' port
    return (m ? {
      href     : m[0] || '',
      protocol : m[1] || '',
      authority: m[2] || '',
      host     : m[3] || '',
      hostname : m[4] || '',
      port     : m[5] || '',
      pathname : m[6] || '',
      search   : m[7] || '',
      hash     : m[8] || ''
    } : null);
  }

  function absolutizeURI(base, href) {// RFC 3986

    function removeDotSegments(input) {
      var output = [];
      input.replace(/^(\.\.?(\/|$))+/, '')
           .replace(/\/(\.(\/|$))+/g, '/')
           .replace(/\/\.\.$/, '/../')
           .replace(/\/?[^\/]*/g, function (p) {
        if (p === '/..') {
          output.pop();
        } else {
          output.push(p);
        }
      });
      return output.join('').replace(/^\//, input.charAt(0) === '/' ? '/' : '');
    }

    href = parseURI(href || '');
    base = parseURI(base || '');

    return !href || !base ? null : (href.protocol || base.protocol) +
           (href.protocol || href.authority ? href.authority : base.authority) +
           removeDotSegments(href.protocol || href.authority || href.pathname.charAt(0) === '/' ? href.pathname : (href.pathname ? ((base.authority && !base.pathname ? '/' : '') + base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1) + href.pathname) : base.pathname)) +
           (href.protocol || href.authority || href.pathname ? href.search : (href.search || base.search)) +
           href.hash;
  }

  function loc() {
    try {
      return global.location.href;
    } catch (e) {
      var a = document.createElement('a');
      a.href = '';
      return a.href;
    }
  }

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

  var XHR2CORSSupported = !!(global.XDomainRequest || (global.XMLHttpRequest && ('onprogress' in (new XMLHttpRequest())) && ('withCredentials' in (new XMLHttpRequest()))));

  // FF 6 doesn't support SSE + CORS
  if (!global.EventSource || XHR2CORSSupported) {
    global.EventSource = function (url, options) {
      function F() {}
      F.prototype = global.EventSource.prototype;

      url = absolutizeURI(loc(), String(url));
      if (!url) {
        throw new Error('');
      }

      var that = new F(),
        retry = 1000,
        lastEventId = '',
        xhr = null,
        reconnectTimeout = null,
        realReadyState,
        origin = parseURI(url);

      origin = origin.protocol + origin.authority;

      that.url = url;
      that.withCredentials = !!(options && options.withCredentials);

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

        var postData = (lastEventId !== '' ? 'Last-Event-ID=' + encodeURIComponent(lastEventId) : ''),
            offset = 0,
            charOffset = 0,
            data = '',
            newLastEventId = lastEventId,
            name = '';

        xhr = global.XDomainRequest ? (new XDomainRequestWrapper()) : (global.XMLHttpRequest ? (new global.XMLHttpRequest()) : (new ActiveXObject('Microsoft.XMLHTTP')));

        // with GET method in FF xhr.onreadystatechange with readyState === 3 doesn't work + POST = no-cache
        xhr.open('POST', url, true);

        // Chrome bug:
        // Request header field Cache-Control is not allowed by Access-Control-Allow-Headers.
        //xhr.setRequestHeader('Cache-Control', 'no-cache');

        // Chrome bug:
        // http://code.google.com/p/chromium/issues/detail?id=71694
        // If you force Chrome to have a whitelisted content-type, either explicitly with setRequestHeader(), or implicitly by sending a FormData, then no preflight is done.
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

        if (!XHR2CORSSupported) {
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');// long-polling
        }

        //  Request header field Last-Event-ID is not allowed by Access-Control-Allow-Headers.
        //if (lastEventId !== '') {
        //  xhr.setRequestHeader('Last-Event-ID', lastEventId);
        //}

        xhr.withCredentials = that.withCredentials;

        xhr.onreadystatechange = function () {
          var readyState = +xhr.readyState,
              responseText = '', contentType = '', i = 0, line, part, stream;

          if (readyState > 2) {
            try {
              responseText = xhr.responseText || '';
            } catch (ex) {}
          }
          if (readyState > 1) {
            try {
              contentType = xhr.getResponseHeader('Content-Type') || '';// old FF bug ?
            } catch (ex2) {}
          }

          //use xhr.responseText instead of xhr.status (http://bugs.jquery.com/ticket/8135)
          if (realReadyState === that.CONNECTING && /^text\/event\-stream/i.test(contentType) && (readyState > 1) && (readyState !== 4 || responseText)) {
            queue({'type': 'open'}, that.OPEN);
          }

          if (realReadyState === that.OPEN && /\r|\n/.test(responseText.slice(charOffset))) {
            part = responseText.slice(offset);
            stream = (offset ? part : part.replace(/^\uFEFF/, '')).replace(/\r\n?/g, '\n').split('\n');

            offset += part.length - stream[stream.length - 1].length;
            while (i < stream.length - 1) {
              line = stream[i].match(/([^\:]*)(?:\:\u0020?([\s\S]+))?/);

              if (!line[0]) {
                // dispatch the event
                if (data) {
                  lastEventId = newLastEventId;
                  queue({
                    'type': name || 'message',
                    origin: origin,
                    lastEventId: lastEventId,
                    data: data.replace(/\u000A$/, '')
                  }, null);
                }
                // Set the data buffer and the event name buffer to the empty string.
                data = '';
                name = '';
              }

              if (line[1] === 'event') {
                name = line[2];
              }

              if (line[1] === 'id') {
                newLastEventId = line[2];
                //lastEventId = line[2];//!!! see bug http://www.w3.org/Bugs/Public/show_bug.cgi?id=13761
              }

              if (line[1] === 'retry') {
                if (/^\d+$/.test(line[2])) {
                  retry = +line[2];
                }
              }

              if (line[1] === 'data') {
                data += line[2] + '\n';
              }

              i++;
            }
          }
          charOffset = responseText.length;

          if (readyState === 4) {
            xhr.onreadystatechange = empty;// old IE bug?
            xhr = null;
            if (realReadyState === that.OPEN) {
              // reestablishes the connection
              queue({'type': 'error'}, that.CONNECTING);
              // setTimeout will wait before previous setTimeout(0) have completed
              reconnectTimeout = setTimeout(openConnection, retry);
            } else {
              if ('\v' === 'v' && global.detachEvent) {
                global.detachEvent('onunload', close);
              }

              //fail the connection
              queue({'type': 'error'}, that.CLOSED);
            }
          }
        };
        xhr.send(postData);
      }
      openConnection();

      if ('\v' === 'v' && global.attachEvent) {
        global.attachEvent('onunload', close);
      }

      return that;
    };
  }

  global.EventSource.CONNECTING = 0;
  global.EventSource.OPEN = 1;
  global.EventSource.CLOSED = 2;
  global.EventSource.supportCORS = XHR2CORSSupported;

}(this));
