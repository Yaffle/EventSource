import {Component, NgZone, OnInit} from '@angular/core';
import {EventSourcePolyfill} from "ng-event-source";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  zone: NgZone;
  messages = new Array<string>();

  status: number;

  ngOnInit(): void {
    this.zone = new NgZone({enableLongStackTrace: false});
    let eventSource = new EventSourcePolyfill('http://localhost:3000', {});
    eventSource.onmessage = (data => {
      console.log(data.data);
      this.zone.run(() => {
        this.messages.push(data.data);
      });
    });
    eventSource.onopen = (a) => {
    };
    eventSource.onerror = (e) => {
      this.zone.run(() => {
        if (e.errorCode) {
          this.status = e.errorCode
        }
      });
    }
  }


}
