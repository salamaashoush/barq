---
"@barqjs/compiler": patch
---

A `<Show>`, `<For>` or `<Switch>` that is its element's only child now writes the same hydration markup in development and production builds, so a server and a browser compiled with different `dev` settings claim it instead of reporting a mismatch and rebuilding it. A development build no longer writes the branch key at such a position.
