import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "feedback",
  title: "Feedback and states",
  description:
    "Confirmations that ask for more, modals opened by id, result and status pages, empty states by kind, page skeletons, live timers and the lifecycle of what is archived or deleted.",
  examples: [
    {
      id: "confirmations",
      title: "Confirmations",
      description:
        "confirm() with a checkbox, a choice or a reason, a name typed to delete, an action run inside the question, and a delete that checks what depends on it first. ActionMenu confirms its destructive items.",
      covers: ["confirm", "ConfirmHost", "ActionMenu"],
    },
    {
      id: "modals",
      title: "Modals opened by id",
      description:
        "A modal defined once and fetched on first use or on hover, opened from a handler and resolving with its result.",
      covers: ["defineModal", "openModal", "preloadModal", "ModalHost"],
    },
    {
      id: "linked-dialogs",
      title: "Dialogs with a link",
      description:
        "An overlay opened by a search parameter or its own button, and a full-screen editor with its save in a bar across the top.",
      covers: ["ResponsiveOverlay", "Tearsheet", "useOpenParam"],
    },
    {
      id: "action-feedback",
      title: "Action feedback",
      description:
        "A mutation's pending state, its success toast, and its failure as a toast or inline, in the server's words made a sentence.",
      covers: ["useAction", "ActionError", "serverMessage"],
    },
    {
      id: "empty-states",
      title: "Empty states by kind",
      description:
        "Nothing yet, nothing that matches with Clear filters, nothing the reader may see naming who grants access, and all done; full size or as a quiet line in a section.",
      covers: ["EmptyState"],
    },
    {
      id: "success",
      title: "Success",
      description: "The end of a flow that worked: what was done, what to do next and where to go.",
      covers: ["SuccessState"],
    },
    {
      id: "status-pages",
      title: "Status pages",
      description:
        "Not found, forbidden, gone, signed out, offline, unreachable and failed, each with its way out, and a route's error read off what it threw.",
      covers: ["StatusPage", "ErrorPage", "NotFoundPage"],
    },
    {
      id: "skeletons",
      title: "Page skeletons",
      description: "What a page shows while it loads, shaped like the page it becomes.",
      covers: ["PageSkeleton"],
    },
    {
      id: "values",
      title: "Values that may be absent",
      description:
        "An absence said in words, never left blank: never, no limit, nobody yet, not applicable.",
      covers: ["Value"],
    },
    {
      id: "timers",
      title: "Timers",
      description:
        "A countdown that tones and announces at its thresholds, an elapsed time, the exact moment behind a relative one, and a session about to end.",
      covers: ["Countdown", "RelativeTime", "SessionExpiryWarning"],
    },
    {
      id: "lifecycle",
      title: "Archive, delete and review",
      description:
        "The notice on an archived or deleted item with Restore, a recently deleted list, and a document reviewed in stages that locks once completed.",
      covers: ["LifecycleNotice", "RestoreButton", "DocumentWorkflowBar", "useDocumentWorkflow"],
    },
  ],
};
