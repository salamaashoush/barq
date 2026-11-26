---
"@barqjs/core": patch
"@barqjs/web": patch
---

A `<For>` row that renders nothing (a component returning `null` or `undefined`, or an empty string) now hydrates the server's markup when it comes after the last row that rendered something. The browser reported such a row as one the server did not send, so the list counted as longer in the browser and a structure mismatch was recorded for a page that matched.
