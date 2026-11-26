---
"@barqjs/arc": minor
---

arc gains the confirmations, dialogs and result states product screens kept building by hand.

- arc `confirm()` asks with a `field` (a checkbox, a choice or required words, resolving `{ value }` or `null`), waits for `typeToConfirm`, draws `details`, runs `action` inside the question with its failure kept there, and with `dependents` checks what depends on the thing first, refusing with a list of blockers or naming the affected and their fallback.
- arc `ActionMenu`: regular actions, then destructive ones after a separator, each confirmed naming what it removes.
- arc `defineModal`, `openModal`, `preloadModal`, `closeModals` and `ModalHost`: modals opened by definition from anywhere, fetched on first use, resolving with a value, dismissed when the path changes. `ArcProvider` renders the host.
- arc `ResponsiveOverlay` takes `param` and `clearParams`, as `Tearsheet` now does too, and a trigger opens either without touching the URL; `useOpenParam` gives any dialog a search parameter. `Tearsheet size="full"` with `actions` is a full-screen editor with its save in a bar across the top.
- arc `useAction` and `ActionError` tie a mutation to its pending state, success toast and failure; `serverProblem`, `serverMessage`, `serverErrors`, `serverErrorKind` and `routeError` turn an API's error into a sentence, field errors, a kind and the router's not-found.
- arc `EmptyState` takes `kind` (`filtered` with Clear filters, `restricted` naming who grants access, `done`), `placement="section"`, `headingLevel` and content between its words and actions.
- arc `SuccessState`, `StatusPage`, `ErrorPage`, `NotFoundPage`, `PageSkeleton` and `Value`.
- arc `Countdown`, `useClock` and `SessionExpiryWarning`; `RelativeTime` takes `exact`, a button that opens the exact moment and its zone.
- arc `LifecycleNotice`, `RestoreButton`, `useDocumentWorkflow` and `DocumentWorkflowBar`.
