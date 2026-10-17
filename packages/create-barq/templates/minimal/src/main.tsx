import { render } from "@barqjs/web";

import { App } from "./App.tsx";

const root = document.getElementById("app");
if (root === null) throw new Error("no #app in index.html");

render(() => <App />, root);
