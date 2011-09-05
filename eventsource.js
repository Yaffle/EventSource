/*jslint plusplus: true, indent: 2 */
/*global XMLHttpRequest, setTimeout, clearTimeout, navigator, XDomainRequest, ActiveXObject*/

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

    return that;
  }

  function extendAsEventTarget(obj) {
    var listeners = [];

    obj.dispatchEvent = function (eventObject) {
      var clone = listeners.slice(0),
          type = eventObject.type, i;
      for (i = 0; i < clone.length; i++) {
        if (clone[i].type === type) {
          clone[i].callback.call(obj, eventObject);
        }
      }
    };

    function lastIndexOf(type, callback) {
      var i = listeners.length - 1;
      while (i >= 0 && !(listeners[i].type === type && listeners[i].callback === callback)) {
        i--;
      }
      return i;
    }

    obj.addEventListener = function (type, callback) {      
      if (lastIndexOf(type, callback) === -1) {
        listeners.push({type: type, callback: callback});
      }
    };

    obj.removeEventListener = function (type, callback) {
      var i = lastIndexOf(type, callback);
      if (i !== -1) {
        listeners[i].type = {};// mark as removed
        listeners.splice(i, 1);      
      }
    };

    return obj;
  }

  if (global.EventSource) {
    return;
  }

  global.EventSource = function (resource) {

    var that = (this === global) ? {} : this,
      retry = 1000,
      offset = 0,
      lastEventId = '',
      xhr = null,
      reconnectTimeout = null,
      data = '', 
      name = '';

    that.url = resource;
    that.CONNECTING = 0;
    that.OPEN = 1;
    that.CLOSED = 2;
    that.readyState = that.CONNECTING;

    function close() {
      if (xhr !== null) {
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

    extendAsEventTarget(that);

    function parseStream(responseText) {
      var stream = responseText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'),
        i,
        line,
        field,
        value,
        event;

      stream.pop();

      for (i = offset; i < stream.length; i++) {
        line = stream[i];

        if (!line) {
          // dispatch the event
          if (data) {
            event = {
              'type': name || 'message',
              lastEventId: lastEventId,
              data: data.replace(/\u000A$/, '')
            };
            that.dispatchEvent(event);
            if ((name || 'message') === 'message' && typeof that.onmessage === 'function') {
              that.onmessage(event);
            }
          }
          // Set the data buffer and the event name buffer to the empty string.
          data = '';
          name = '';
        }

        field = line.match(/([^\:]*)(?:\:\u0020?([\s\S]+))?/);
        value = field[2];
        field = field[1];

        if (field === 'event') {
          name = value;
        }

        if (field === 'id') {
          lastEventId = value;
        }

        if (field === 'retry') {
          if (/^\d+$/.test(value)) {
            retry = +value;
          }
        }

        if (field === 'data') {
          data += value + '\n';
        }
      }
      offset = stream.length;
    }

    reconnectTimeout = setTimeout(function openConnection() {
      reconnectTimeout = null;
      offset = 0;
      data = '';
      name = '';

      var postData = null,
        polling = false,
        ua = navigator.userAgent;

      if (global.XDomainRequest) {
        xhr = new XDomainRequestWrapper();

        polling = false;
        postData = 'xdomainrequest=1' + (lastEventId !== '' ? '&Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
        xhr.open('POST', that.url);
      } else {
        xhr = global.XMLHttpRequest ? (new global.XMLHttpRequest()) : (new ActiveXObject('Microsoft.XMLHTTP'));

        // with GET method in FF xhr.onreadystate with readyState === 3 doesn't work
        xhr.open('POST', that.url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        polling = ua.indexOf('Gecko') === -1 || ua.indexOf('KHTML') !== -1;
        if (polling) {
          xhr.setRequestHeader('Polling', '1');//!
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        }
        if (lastEventId !== '') {
          xhr.setRequestHeader('Last-Event-ID', lastEventId);
        }
        //xhr.withCredentials = true;
      }

      xhr.onreadystatechange = function () {

        if (that.readyState === that.CONNECTING) {
          if (+xhr.readyState !== 4 || xhr.responseText) {//use xhr.responseText instead of xhr.status (http://bugs.jquery.com/ticket/8135)
            that.readyState = that.OPEN;
          }
          if (that.readyState === that.OPEN) {
            that.dispatchEvent({'type': 'open'});
            if (typeof that.onopen === 'function') {
              that.onopen({'type': 'open'});
            }
          }
        }

        if (+xhr.readyState === 4) {
          parseStream(xhr.responseText || '');
          
          that.readyState = that.CONNECTING;
          /*if (+xhr.status !== 200) {//fail the connection
            that.readyState = that.CLOSED;
          }*/
          that.dispatchEvent({'type': 'error'});
          if (typeof that.onerror === 'function') {
            that.onerror({'type': 'error'});
          }

          if (that.readyState !== that.CLOSED) { // reestablishes the connection
            reconnectTimeout = setTimeout(openConnection, retry);
          }
        }
        if (!polling && +xhr.readyState === 3) {
          parseStream(xhr.responseText || '');
        }
      };
      xhr.send(postData);
    }, 1);

    if ('\v' === 'v' && global.attachEvent) {
      global.attachEvent('onunload', close);
    }

    return that;
  };
}(this));
