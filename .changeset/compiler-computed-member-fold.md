---
"@barqjs/compiler": patch
---

A style group read by index, such as `gap[4]` or `gap["4"]`, now composes at build time like one read by name. Every arc style group that composed a gap step used to stay a runtime `layer()` call.
