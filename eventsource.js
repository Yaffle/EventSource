/**
  EventSource polyfill for browsers, that doesn't implement native EventSource
  
  Uses XMLHttpRequest:
  "server push" (XMLHTTPRequest Interactive state) logic for Firefox
  "long polling" or "polling" logic for other browsers

  Browser Support:
  IE7+, others

  Advantages:
  Based on last specification of EventSource.
  "server push" for Firefox
  Polyfill is independent form document methods (addEventListener), so you
  can use it in a Web Worker's scope.
  
  
  Server-side requirements:
  When "server push" not supported, "Polling" HTTP Header is sended on each request
  to tell your server side script to close connection after 
  sending a data.

  
  http://weblog.bocoup.com/javascript-eventsource-now-available-in-firefox
  http://www.w3.org/TR/eventsource/

  Other EventSource polyfills:
  https://github.com/remy/polyfills/blob/master/EventSource.js by Remy Sharp
  https://github.com/rwldrn/jquery.eventsource by rick waldron
  
*/

/*jslint white: true, onevar: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, maxerr: 50, indent: 2 */
/*global XMLHttpRequest, setTimeout, clearTimeout, navigator*/

(function (global) {

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
      offset  = 0,
      lastEventId = '',
      xhr     = null,
      reconnectTimeout = null,
      data = '', 
      name = '';

    that.url  = resource;
    that.CONNECTING = 0;
    that.OPEN = 1;
    that.CLOSED = 2;
    that.readyState = that.CONNECTING;
    
    that.close = function () {
      if (xhr !== null) {
        xhr.abort();//?
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
      var stream = responseText.replace(/^\uFEFF/, '').replace(/\r\n?/, '\n').split('\n'),
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

      xhr = new XMLHttpRequest();

      // with GET method in FF xhr.onreadystate with readyState === 3 doesn't work
      xhr.open('POST', that.url, true);

      xhr.setRequestHeader('Cache-Control', 'no-cache');//?

      if (polling) {
        xhr.setRequestHeader('Polling', '1');//!
      }
      if (lastEventId !== '') {
        xhr.setRequestHeader('Last-Event-ID', lastEventId);
      }
      xhr.onreadystatechange = function () {
        // responseText
        // The response to the request as text, or null if the request was unsucessful or has not yet been sent. Read-only.

        if (that.readyState === that.CONNECTING) {
          if (+xhr.readyState !== 4  || +xhr.status === 200) {//?
            that.readyState = that.OPEN;
          }
          if (that.readyState === that.OPEN) {
            that.dispatchEvent({'type': 'open'});
            if (typeof that.onopen === 'function') {
              that.onopen.call({'type': 'open'});
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
            that.onerror.call({'type': 'error'});
          }

          if (that.readyState !== that.CLOSED) { // reestablishes the connection
            reconnectTimeout = setTimeout(openConnection, retry);
          }
        }
        if (!polling && +xhr.readyState === 3) {
          parseStream(xhr.responseText || '', false);
        }
      };
      xhr.send(null);
    }

    reconnectTimeout = setTimeout(openConnection, 1);
    return that;
  };
}(this));
