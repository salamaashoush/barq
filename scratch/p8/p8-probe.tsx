import { hydrate } from "@barqjs/core";
import { renderToString } from "@barqjs/server";

const Shell = () => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>SERVED</title>
    </head>
    <body>
      <div id="app">hi</div>
    </body>
  </html>
);

const markup = renderToString(() => <Shell />);
console.log("server markup:", markup.slice(0, 160));

document.open();
document.write("<!doctype html>" + markup);
document.close();

console.log("document childNodes:", [...document.childNodes].map((n) => n.nodeName).join(", "));
const title = document.querySelector("title");
const app = document.getElementById("app");

try {
  hydrate(() => <Shell />, document as never);
  console.log("report:", JSON.stringify(hydrate.report));
} catch (error) {
  console.log("THREW:", String(error).slice(0, 300));
  console.log("report at throw:", JSON.stringify(hydrate.report));
}
console.log("title kept?", title === document.querySelector("title"));
console.log("#app kept?", app === document.getElementById("app"));
console.log("html count:", document.querySelectorAll("html").length, "title count:", document.querySelectorAll("title").length);
