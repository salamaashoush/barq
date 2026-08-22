const p = (h: string) => new DOMParser().parseFromString(h, "text/html");
console.log("shell title + body title -> document.title =",
  JSON.stringify(p(`<!doctype html><html><head><title>SHELL</title></head><body><title>BODY</title></body></html>`).title));
console.log("NO shell title, body title -> document.title =",
  JSON.stringify(p(`<!doctype html><html><head></head><body><title>BODY</title></body></html>`).title));
console.log("two head titles -> document.title =",
  JSON.stringify(p(`<!doctype html><html><head><title>ONE</title><title>TWO</title></head><body></body></html>`).title));
