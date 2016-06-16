
declare enum ReadyState {CONNECTING = 0, OPEN = 1, CLOSED = 2}

interface EventSourceConstructor {
  new(url: string, eventSourceInitDict?: EventSourceInit): EventSource;
  CONNECTING: ReadyState;
  OPEN: ReadyState;
  CLOSED: ReadyState;
}

interface EventSource extends EventTarget {
  url: string;
  readyState: ReadyState;
  onopen: Function;
  onmessage: (event: OnMessageEvent) => void;
  onerror: Function;
  close: () => void;
}

interface EventSourceInit {
  withCredentials?: boolean;
  headers?: {[key: string]: string}
}

interface OnMessageEvent {
  data: string;
}

declare var EventSource: EventSourceConstructor;

export default EventSource;
