---
"@barqjs/form": patch
---

A form drawn on the server no longer holds the process open for five seconds. form-core's devtools client polled for a bus that never answers there; `@barqjs/form` now gives it one on the server, so a prerender or one-off render that draws a form exits as soon as it is done.
