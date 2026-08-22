/**
 * What does B1 actually buy over a one-line `<link rel="modulepreload">`?
 *
 * Models the real client entry:
 *   await state.start();            // parks or hits the seed
 *   await preloadMatched(chain);    // ROUTE CHUNK — one more round trip
 *   hydrate(...)                    // needs data + chunk + DOM
 *
 * `hydrate-ready` is when all three are true. That, not "entry executed", is
 * what a user sees.
 */
import { createServer } from "node:http";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENTRY_MS = 120, CHUNK_MS = 120, STREAM_MS = 600;

const SEED_CHANNEL = `(function(){const w={};const wake=(ks)=>{const l=ks===null?Object.keys(w):ks;for(let i=l.length;i--;){const k=l[i];const f=w[k];if(!f)continue;delete w[k];for(let j=f.length;j--;)f[j]()}};window.__BARQ_SEED__={open:1,wait(k,f){(w[k]=w[k]??[]).push(f)},tell(ks){wake(ks)},done(){window.__BARQ_SEED__.open=0;wake(null)}}})();`;

const ENTRY = `
const T=()=>Math.round(performance.now()-window.__T0__);
const KEY="r:/users/$id|id=7";
const getSeed=(k)=>{const s=window.__BARQ_DATA__;if(s&&k in s){const v=s[k];delete s[k];return{found:true,value:v}}return{found:false}};
const seedLater=(k)=>{const c=window.__BARQ_SEED__;if(c===undefined||c.open!==1)return null;return new Promise(d=>c.wait(k,()=>d(getSeed(k))))};
window.__LOG__.push({at:"entry",t:T(),rs:document.readyState});
let dataDone=null;
// primeChain() KICKS the read and swallows NotReadyError; it does NOT await.
const start = () => { const h=getSeed(KEY); if(h.found){window.__LOG__.push({at:"data",t:T(),how:"sync"});dataDone=Promise.resolve();return}
 const l=seedLater(KEY);
 if(l===null){window.__LOG__.push({at:"read-refetch-started",t:T()});dataDone=new Promise(r=>setTimeout(()=>{window.__LOG__.push({at:"data",t:T(),how:"refetch"});r()},150));return}
 window.__LOG__.push({at:"read-parked",t:T()});
 dataDone=l.then(a=>{ if(a.found){window.__LOG__.push({at:"data",t:T(),how:"parked-then-seed"});return} return new Promise(r=>setTimeout(()=>{window.__LOG__.push({at:"data",t:T(),how:"parked-then-refetch"});r()},150)) }); };
start();
await import("/chunk.js");           // preloadMatched(chain)
window.__LOG__.push({at:"chunk",t:T()});
await new Promise(r=>{ if(document.readyState!=="loading")r(); else document.addEventListener("DOMContentLoaded",r) });
window.__LOG__.push({at:"dom-ready",t:T()});
await dataDone;  // hydrate cannot claim a boundary whose value has not landed
window.__LOG__.push({at:"HYDRATE-READY",t:T()});
window.__DONE__=1;
`;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entry.js") { await sleep(ENTRY_MS); res.writeHead(200,{"content-type":"text/javascript","cache-control":"no-store"}); res.end(ENTRY); return; }
  if (url.pathname === "/chunk.js") { await sleep(CHUNK_MS); res.writeHead(200,{"content-type":"text/javascript","cache-control":"no-store"}); res.end(`export const x=1;`); return; }
  const mode = url.searchParams.get("mode") ?? "head";
  res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
  res.write(`<!doctype html><html><head><meta charset="utf-8"><script>window.__T0__=performance.now();window.__LOG__=[]<\/script>`
    + (mode==="head" ? `<script>${SEED_CHANNEL}<\/script><script type="module" async src="/entry.js"></script>` : "")
    + (mode==="preload" ? `<link rel="modulepreload" href="/entry.js"><link rel="modulepreload" href="/chunk.js">` : "")
    + `</head><body><div id="app"><p>loading...</p>`);
  if (mode!=="head") res.write(`<script>${SEED_CHANNEL}<\/script>`);
  await sleep(STREAM_MS);
  res.write(`<script>window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},{"r:/users/$id|id=7":{n:"Ada"}});window.__BARQ_SEED__.tell(["r:/users/$id|id=7"])<\/script>`);
  res.write(`<script>window.__BARQ_SEED__.done()<\/script>`);
  res.end(`</div>` + (mode!=="head" ? `<script type="module" src="/entry.js"></script>` : "") + `</body></html>`);
}).listen(4604, () => console.log("probe4 on 4604"));
