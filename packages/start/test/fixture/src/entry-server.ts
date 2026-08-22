/**
 * A hand-written server entry, so this package can test the WIRING without
 * depending on `@barqjs/router` — which depends on it.
 */

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      return new Response("method not allowed", { status: 405, headers: { allow: "GET" } });
    }
    return new Response(
      `<!doctype html><html><head><title>fixture</title></head>` +
        `<body><div id="app">path:${url.pathname}</div></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  },
};
