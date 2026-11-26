---
"@barqjs/compiler": patch
"@barqjs/core": patch
---

A handler reaches what it was handed to. `<button {...props} />` attached each handler's Cell as the listener, so a click answered with the handler instead of running it; the record is now read through `elementProps`, which takes each handler and `ref` out of its Cell. A part branded with `asRecord` and spread onto a component hands its handlers over uncalled, where the component's first read used to call them. `createComponent` called from a `.ts` module takes the record of Cells only, so a record of values with a callback in it is a type error rather than a callback the read calls.
