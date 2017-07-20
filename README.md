
This fork provide the following on top of the original:

- The ability to provide custom HTTP headers in the options object (e.g Authorization)
- The module returns the actual EventSource implementation, rather than sometimes polyfilling, sometimes not.
- Typescript typings
- Use SSE in your Angular project

Forked from: https://github.com/AlexGalays/EventSource

How to use with angular:
-------------------------



TypeScript
```typescript
import {EventSourcePolyfill} from 'ng-event-source';

let eventSource = new EventSourcePolyfill('http://my/url', {headers: { headerName: 'HeaderValue', header2: 'HeaderValue2' }});
eventSource.onmessage = (data => {
    this.zone.run(() => {
        // Do stuff here
    });
});
eventSource.onopen = (a) => {
    // Do stuff here
};
eventSource.onerror = (e) => {
    // Do stuff here
}
```

EventSource polyfill - http://www.w3.org/TR/eventsource/

License
-------
The MIT License (MIT)

Copyright (c) 2012 vic99999@yandex.ru

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
