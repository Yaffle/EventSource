
/*

<style type="text/css">

*[draggable] {
  display: block;
  width: 100px;
  height: 100px;
  border: 1px solid silver;
  margin: 10px;
  cursor: move;
}

.dragNode {
  position: absolute;
  cursor: copy;
  margin: 0;
  padding: 0;
  border: 1px solid silver;
  width: 48px;
  height: 48px;
  margin-left: -24px;
  margin-top: -24px;
  font-size: 12px;
  line-height: 16px;
  box-shadow: inset 0 0 24px silver, 0 0 12px gray;
  z-index: 10;

  display: table;
}

.dragNode div {
  display: table-cell;
  vertical-align: middle;
  text-align: center;
}

.dragNode.not-allowed {
  cursor: not-allowed;
}

</style>

<div draggable="true"></div>

*/

(function () {

  if (({}).toString.call(window.opera) !== '[object Opera]' || ('ondragstart' in document.createElement('div'))) {
    return;
  }

  var dragTarget = null,
      dragData = {},
      dragImage = null,
      realDragTarget = null,
      lastDropTarget = null;

  function createEvent(name, relatedTarget) {
    var event = document.createEvent('Event');
    event.initEvent(name, true, true);
    if ('dragenter dragover dragleave drop'.indexOf(name) !== -1) {
      event.dataTransfer = {
        getData: function (dataFormat) {
          return dragData[dataFormat] || '';
        }
      };
    }
    if (name === 'dragstart') {// read/write mode
      event.dataTransfer = {
        setDragImage: function (image, x, y) {
          dragImage = image;
        },
        setData: function (dataFormat, data) {
          dragData[dataFormat] = data;
        },
        clearData: function (dataFormat) {
          if (arguments.length) {
            dragData[dataFormat] = null;
          } else {
            dragData = {};
          }
        }
      };
    }
    event.relatedTarget = relatedTarget || null;
    return event;
  }

  function getDropTarget(event) {
    dragTarget.style.display = 'none';
    var dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    if (dropTarget.nodeType === 3) { // Opera
      dropTarget = dropTarget.parentNode;
    }
    dragTarget.style.display = '';
    return dropTarget;
  }

  function onMouseMove(event) {
    if (!dragTarget && realDragTarget) {
      if (!initDrag(event)) {
        stop();
      }
      return;
    }
    
  
    if (dragTarget) {
      window.getSelection().removeAllRanges();
    
      dragTarget.style.left = event.pageX + 'px';
      dragTarget.style.top = event.pageY + 'px';

      var dropTarget = getDropTarget(event);

      if (lastDropTarget !== dropTarget) {
        if (lastDropTarget) {
          lastDropTarget.dispatchEvent(createEvent('dragleave', dropTarget));
        }
        lastDropTarget = dropTarget;
        if (dropTarget && dropTarget.dispatchEvent(createEvent('dragenter'))) {
          lastDropTarget = null;
        }
        
        if (lastDropTarget) {
          dragTarget.className = 'dragNode';
        } else {
          dragTarget.className = 'dragNode not-allowed';
        }

      } else {
        if (lastDropTarget && lastDropTarget.dispatchEvent(createEvent('dragover'))) {
          lastDropTarget = null;
        }
      }
      realDragTarget.dispatchEvent(createEvent('drag'));

      event.preventDefault();
      event.stopPropagation();
    }
  }

  function initDrag(event) {
    if (realDragTarget.tagName === 'IMG') {
      dragData['Text'] = realDragTarget.src;
      dragData['URL'] = realDragTarget.src;
      dragImage = realDragTarget;
    }
    if (realDragTarget.tagName === 'A' && realDragTarget.href) {
      dragData['Text'] = realDragTarget.href;
      dragData['URL'] = realDragTarget.href;
    }
    if (realDragTarget.dispatchEvent(createEvent('dragstart'))) {
      dragTarget = document.createElement('div');
      dragTarget.className = 'dragNode';
      dragTarget.innerHTML = '<div>Drag<br />and<br />Drop</div>';
      onMouseMove(event);
      if (dragImage) {
        if (dragImage.tagName === 'IMG' && dragImage.src) {
          dragTarget.innerHTML = '<img src="' + dragImage.src + '" />';
        } else {
          try {
            var canvas = document.createElement('canvas');
            var context = canvas.getContext('2d');
            canvas.width = realDragTarget.width;
            canvas.height = realDragTarget.height;
            context.drawImage(realDragTarget, 0, 0);
          
            dragTarget.innerHTML = '<img src="' + canvas.toDataURL() + '" />';
          } catch (e) {
            // same origin or not img element...
          }
        }

      }
      document.body.appendChild(dragTarget);
      return true;
    }
    return false;
  }

  function stop() {
    if (dragTarget) {
      realDragTarget.dispatchEvent(createEvent('dragend'));

      dragTarget.parentNode.removeChild(dragTarget);
    }
    dragTarget = null;
    dragData = {};
    dragImage = null;
    if (lastDropTarget) {
      lastDropTarget.dispatchEvent(createEvent('dragleave'));
      lastDropTarget = null;
    }
    document.removeEventListener('mousemove', onMouseMove, false);    
    realDragTarget = null;
  }

  document.addEventListener('mouseup', function (event) {
    if (dragTarget) {
      if (lastDropTarget) {
        lastDropTarget.dispatchEvent(createEvent('drop'));
      }
    }
    stop();
  }, false);

  document.addEventListener('mousedown', function (event) {
    stop();

    var target = event.target;
    while (target && !((target.hasAttribute && target.hasAttribute('draggable')) || target.tagName === 'IMG' || (target.tagName === 'A' && target.href))) {
      target = target.parentNode;
    }

    if (target && (+event.which === 1 || (!event.which && event.button === 1))) {
      realDragTarget = target;
      //if (!initDrag(event)) {// init on mouse down!!!! not on mouse move!!! to prevent text selection
      //  realDragTarget = null;
      //} else {
        document.addEventListener('mousemove', onMouseMove, false);
     // }
    }
  }, false);

}());
