// afterframe — https://github.com/andrewiggins/afterframe, MIT licensed.
// Vendored verbatim from js-framework-benchmark's own
// `webdriver-ts/src/benchmarksWebdriverAfterframe.ts`, which is the definition
// of "duration" this lane adopts: the time from the click to the end of the
// frame the browser rendered it in.
//
// requestAnimationFrame alone is the wrong instrument. It fires BEFORE style,
// layout, paint and composite, so a rAF callback times the script and none of
// the work the framework's output actually causes. Posting a message from
// inside rAF lands the callback in the task queue after the frame has been
// committed, which is why this file exists at all.
let callbacks = [];

let channel = new MessageChannel();

let postMessage = function () {
  this.postMessage(undefined);
}.bind(channel.port2);

channel.port1.onmessage = () => {
  let toFlush = callbacks;
  callbacks = [];
  let time = performance.now();
  for (let i = 0; i < toFlush.length; i++) toFlush[i](time);
};

// If the onmessage handler closes over the MessageChannel, it never gets GC'd.
channel = null;

window.afterFrame = function (callback) {
  if (callbacks.push(callback) === 1) requestAnimationFrame(postMessage);
};

window.__afterFrameDuration = function (act) {
  return new Promise((resolve) => {
    let t0 = performance.now();
    act();
    window.afterFrame(() => resolve(performance.now() - t0));
  });
};
