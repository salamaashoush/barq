const srv = Bun.serve({ port: 0, fetch: () => new Response('{"ok":1}') });
const url = `http://127.0.0.1:${srv.port}/_barq/fn/x.data`;
for (let i = 0; i < 200; i++) await fetch(url, { method: "POST", body: "{}" });
const t0 = Bun.nanoseconds();
const N = 2000;
for (let i = 0; i < N; i++) { const r = await fetch(url, { method: "POST", body: "{}" }); await r.text(); }
const per = (Bun.nanoseconds() - t0) / N;
console.log(`localhost POST round trip (FLOOR, no network, no handler): ${(per/1000).toFixed(1)} us`);
console.log(`matcher last-of-200 = 3811 ns => ${(3811/per*100).toFixed(3)}% of one loopback round trip`);
console.log(`matcher at 100 routes ~1900 ns => ${(1900/per*100).toFixed(3)}%`);
console.log(`vs a realistic 30ms WAN loader: ${(3811/30e6*100).toFixed(4)}%`);
srv.stop(true);
