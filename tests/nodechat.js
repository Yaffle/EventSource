/*jslint vars: true, indent: 2 */
/*global navigator, location, window, document, setTimeout, XMLHttpRequest, Image, EventSource */

"use strict";

this.onerror = (function () {
  var sent = {};
  return function (message, url, lineNumber) {
    var x = JSON.stringify({
      message: String(message || ''),
      url: String(url || ''),
      lineNumber: String(lineNumber || '')
    });
    if (!sent[x]) {
      sent[x] = true;
      (new Image()).src = 'http://matrixcalc.org/jserrors.php' + '?error=' + encodeURIComponent(x) + '&nc=' + encodeURIComponent(Math.random());
    }
  };
}());

function now() {
  var performance = window.performance;
  if (performance && performance.now) {
    return performance.now();
  }
  return new Date().getTime();
}

var lastSendedMessageId = Infinity;
var lastEventId = null;
var lastSendedTime = null;
var msgs = document.createDocumentFragment();
var es = new EventSource('events');

function checkId() {
  if (lastEventId >= lastSendedMessageId) {
    lastSendedMessageId = Infinity;
    var div = document.createElement('div');
    div.className = 'ping';
    div.innerHTML = ' (ping: ' + (now() - lastSendedTime).toFixed(0) + 'ms) ';
    msgs.insertBefore(div, msgs.firstChild);
  }
}

es.addEventListener('message', function (event) {
  lastEventId = +event.lastEventId;
  var div = document.createElement('div');
  var text = document.createTextNode(event.data);
  div.appendChild(text);
  msgs.insertBefore(div, msgs.firstChild);
  checkId();
});

function showReadyState(event) {
  document.getElementById('readyStateConnecting').style.visibility = es.readyState === es.CONNECTING ? 'visible' : 'hidden';
  document.getElementById('readyStateOpen').style.visibility = es.readyState === es.OPEN ? 'visible' : 'hidden';
  document.getElementById('readyStateClosed').style.visibility = es.readyState === es.CLOSED ? 'visible' : 'hidden';
}

function post() {
  var message = document.getElementById('message').value;
  if (!message) {
    return false;
  }
  document.getElementById('message').value = '';

  lastSendedTime = now();
  lastSendedMessageId = Infinity;

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '?message=' + encodeURIComponent(message), true);
  xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      lastSendedMessageId = +xhr.responseText || Infinity;
      checkId();
    }
  };
  xhr.send(null);

  return false;
}

window.onload = function () {
  es.addEventListener('open', showReadyState);
  es.addEventListener('error', showReadyState);
  showReadyState(null);
  var m = document.getElementById('msgs');
  m.appendChild(msgs);
  msgs = m;
  document.querySelector("form").onsubmit = function (e) {
    post();
    return false;
  };
};
