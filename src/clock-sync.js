// NTP-style midpoint estimate from authenticated round trips. The lowest-delay
// sample minimizes queuing error; timestamps never influence buzzer arbitration.
export class ClockSync {
  samples = [];
  add(sentAt, receivedAt, serverNow) {
    const rtt = receivedAt - sentAt;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10000) return false;
    this.samples.push({ rtt, offset: serverNow - (sentAt + receivedAt) / 2 });
    this.samples = this.samples.slice(-8);
    return true;
  }
  get best() {
    return this.samples.reduce((a, b) => (!a || b.rtt < a.rtt ? b : a), null);
  }
  get offset() {
    return this.best?.offset || 0;
  }
  get ready() {
    return this.samples.length >= 2;
  }
  get latency() {
    return this.samples.at(-1)?.rtt ?? null;
  }
}
