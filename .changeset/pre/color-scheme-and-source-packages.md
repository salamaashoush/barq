---
"@barqjs/vite": patch
"@barqjs/server": patch
"@barqjs/web": patch
"@barqjs/primitives": patch
---

`@barqjs/primitives` adds `colorScheme`, `useColorScheme` and `colorSchemeScript`: a light, dark or system theme kept in a cookie and written on `<html>` before the first paint, so a server-rendered or prerendered page never flashes the wrong theme.

The Vite plugin finds packages that publish source at any depth and through peer dependencies, resolving each from where its dependent is installed. A design system built on `@barqjs/aria` no longer leaves `@barqjs/primitives` external in the server bundle.

Inline scripts and styles declared through `useHead` carry the render's CSP nonce, in the shell and in streamed head patches, and an `id` names a script's or style's head identity.
