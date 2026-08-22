import { parse } from "/home/sashoush/Workspace/barq/node_modules/.bun/parse5@7.3.0/node_modules/parse5/dist/index.js";

const show = (label: string, doc: unknown) => {
  const walk = (n: any, depth = 0): string[] => {
    const out: string[] = [];
    const name = n.nodeName;
    if (name !== "#text" && name !== "#document" && name !== "#comment") {
      out.push("  ".repeat(depth) + "<" + name + (n.attrs?.length ? " " + n.attrs.map((a:any)=>`${a.name}="${a.value}"`).join(" ") : "") + ">" +
        (n.childNodes?.filter((c:any)=>c.nodeName==="#text").map((c:any)=>c.value).join("") ?? ""));
    }
    for (const c of n.childNodes ?? []) out.push(...walk(c, name === "#document" ? depth : depth + 1));
    return out;
  };
  console.log(`\n--- ${label} ---\n` + walk(doc).join("\n"));
};

// Q6: is a <title>/<meta>/<link> written into the BODY hoisted into <head>?
show("title/meta/link in the BODY", parse(
  `<!doctype html><html><head><meta charset="utf-8"><title>SHELL</title></head>` +
  `<body><div id="app">hi</div>` +
  `<title>BODY-TITLE</title>` +
  `<meta name="description" content="body-desc">` +
  `<link rel="canonical" href="/body">` +
  `</body></html>`
));

// no shell title at all
show("body title, NO shell title", parse(
  `<!doctype html><html><head><meta charset="utf-8"></head><body><title>BODY-ONLY</title></body></html>`
));

// what barq's kitchen-sink shell + renderHead produces
show("kitchen-sink shape", parse(
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<title data-barq-head="title">Route</title>` +
  `</head><body><div id="app">x</div></body></html>`
));
