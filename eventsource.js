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

/* 
  XMLHttpRequest for IE6
*/
if (typeof XMLHttpRequest === "undefined" && typeof ActiveXObject !== "undefined") {
  XMLHttpRequest = function () {
    try {
      return new ActiveXObject("Microsoft.XMLHTTP");
    } catch (e) {}
  };
}

(function (global) {
  "use strict";

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

  function extendAsEventDispatcher(obj) {
    var listeners = {};

    obj.dispatchEvent = function (eventObject) {
      var x = (listeners[eventObject.type] || []), i;
      for (i = x.length - 1; i >= 0; i--) {
        x[i].call(obj, eventObject);
      }
    };

    obj.addEventListener = function (type, callback) {
      obj.removeEventListener(type, callback);
      listeners[type].push(callback);
    };

    obj.removeEventListener = function (type, callback) {
      var x = listeners[type] || [], y = [], i;
      for (i = x.length - 1; i >= 0; i--) {
        if (x[i] !== callback) {
          y.push(x[i]);
        }
      }
      listeners[type] = y;
    };

    return obj;    
  }

  var ua = navigator.userAgent,
    polling = ua.indexOf('Gecko') === -1 || ua.indexOf('KHTML') !== -1; //? long polling ?!

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

    that.close = function () {
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

    extendAsEventDispatcher(that);

    function dEvent() {
      if (data) {
        var event = {
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

    function parseStream(responseText, eof) {
      var stream = responseText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'),
        i,
        line,
        dataIndex,
        field,
        value;

      if (!eof) {
        // last string
        stream.length = Math.max(0, stream.length - 1);
      }

      for (i = offset; i < stream.length; i++) {
        line = stream[i];

        dataIndex = line.indexOf(':');
        field = null;
        value = '';

        if (!line) {
          dEvent();
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
          // If the field value consists of only characters in the range U+0030 DIGIT ZERO (0) 
          // to U+0039 DIGIT NINE (9), then interpret the field value as an integer in base ten, 
          // and set the event stream's reconnection time to that integer. Otherwise, ignore the field.
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

    function openConnection() {
      reconnectTimeout = null;
      offset = 0;
      data = '';
      name = '';
      
      var postData = null;

      if (global.XDomainRequest) {
        xhr = new XDomainRequestWrapper();

        polling = false;
        postData = 'xdomainrequest=1' + (lastEventId !== '' ? '&Last-Event-ID=' + encodeURIComponent(lastEventId) : '');
        xhr.open('POST', that.url);
      } else {
        xhr = new XMLHttpRequest();

        // with GET method in FF xhr.onreadystate with readyState === 3 doesn't work
        xhr.open('POST', that.url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache');
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
          parseStream(xhr.responseText || '', true);//?my
          dEvent();//? Once the end of the file is reached, the user agent must dispatch the event one final time
          
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
    }

    reconnectTimeout = setTimeout(openConnection, 1);
    return that;
  };
}(this));
