// What every host barq runs on provides. `tsconfig.no-dom.json` checks this
// package against these in place of `lib.dom`.

declare function queueMicrotask(callback: () => void): void;
