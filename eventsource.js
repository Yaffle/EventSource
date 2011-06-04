/**
  EventSource polyfill for browsers, that doesn't implement native EventSource
  
  Uses XMLHttpRequest:
  "server push" (using XMLHTTPRequest Interactive state, XDomainRequest) logic for Firefox, IE8+ (Opera11+, Chrome8, Safari5 has native support for EventSource)
  "long polling" or "polling" logic for other browsers

  Browser Support:
  IE6+, others

  Advantages:
  * Based on last specification of EventSource.
  * "server push" for Firefox
  * "server push" for IE 8+ with XDomainRequest
  * Polyfill is independent from document methods (addEventListener), so you
  * can use it in a Web Worker's scope.
  
  
  Server-side requirements:
  When "server push" not supported, "Polling" HTTP Header is sended on each request
  to tell your server side script to close connection after 
  sending a data.
  XDomainRequest sends "Last-Event-ID" with POST body (XDomainRequest object does not have a setRequestHeader method)
  Also XDomainRequest requires send two kilobyte “prelude” at the top of the response stream.
  ( http://blogs.msdn.com/b/ieinternals/archive/2010/04/06/comet-streaming-in-internet-explorer-with-xmlhttprequest-and-xdomainrequest.aspx?PageIndex=1 )

  http://weblog.bocoup.com/javascript-eventsource-now-available-in-firefox
  http://www.w3.org/TR/eventsource/

  Other EventSource polyfills:
  https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
  https://github.com/rwldrn/jquery.eventsource by rick waldron
  
*/
// Server Push: IE8+, FF?+, O11+, S5+, C7+
/*jslint white: true, onevar: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, maxerr: 50, indent: 2 */
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
    var listeners = [],
        id = 1;

    function indexOf(type, callback, i) {
      for (i = 0; i < listeners.length; i++) {
        if (listeners[i].callback === callback && listeners[i].type === type) {
          return i;
        }
      }
      return -1;
    }

    obj.dispatchEvent = function (eventObject) {
      var i = 0, lowerId = 0, upperId = id, type = eventObject.type;
      while (i < listeners.length) {
        if (lowerId < listeners[i].id && listeners[i].id < upperId && listeners[i].type === type) {
          lowerId = listeners[i].id;
          listeners[i].callback.call(obj, eventObject);
          i = -1;
        }
        i++;
      }
    };

    obj.addEventListener = function (type, callback) {
      if (indexOf(type, callback) === -1) {
        listeners.push({id: id, type: type, callback: callback});
        id++;
      }
    };

    obj.removeEventListener = function (type, callback) {
      var i = indexOf(type, callback);
      if (i !== -1) {
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
    };
    that.close = close;

    extendAsEventTarget(that);

    function parseStream(responseText, eof) {
      var stream = responseText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'),
        i,
        line,
        dataIndex,
        field,
        value,
        event;

      if (!eof) {
        // last string
        stream.length = Math.max(0, stream.length - 1);
      } else {
        // Once the end of the file is reached, the user agent must dispatch the event one final time
        // add empty line to dispatch the event
        stream.push('');
      }

      for (i = offset; i < stream.length; i++) {
        line = stream[i];

        dataIndex = line.indexOf(':');
        field = null;
        value = '';

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
        
        if (dataIndex !== 0) {
          if (dataIndex !== -1) {
            field = line.slice(0, dataIndex);
            value = line.slice(dataIndex + 1).replace(/^\u0020/, '');
          } else {
            field = line;
            value = '';
          }
        }

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
        if (global.XMLHttpRequest) {
          xhr = new global.XMLHttpRequest();
        } else {
          xhr = new ActiveXObject("Microsoft.XMLHTTP"); // IE 6
        }

        // with GET method in FF xhr.onreadystate with readyState === 3 doesn't work
        xhr.open('POST', that.url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        polling = ua.indexOf('Gecko') === -1 || ua.indexOf('KHTML') !== -1;
        if (polling) {
          xhr.setRequestHeader('Polling', '1');//!		  
		  //xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        }
        if (lastEventId !== '') {
          xhr.setRequestHeader('Last-Event-ID', lastEventId);
        }
      }

      xhr.onreadystatechange = function () {

        if (that.readyState === that.CONNECTING) {
          if (+xhr.readyState !== 4  || xhr.responseText) {//use xhr.responseText instead of xhr.status (http://bugs.jquery.com/ticket/8135)
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
          parseStream(xhr.responseText || '', true);
          
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
          parseStream(xhr.responseText || '', false);
        }
      };
      xhr.send(postData);
    }, 1);
    
    if ('\v' === 'v' && window.attachEvent) {
      window.attachEvent('onunload', close);
    }

    return that;
  };
}(this));
