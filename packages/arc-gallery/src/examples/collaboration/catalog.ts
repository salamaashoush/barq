import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "collaboration",
  title: "Collaboration",
  description:
    "Comments, version history, entity pickers, image fields, view switchers and docked panels.",
  examples: [
    {
      id: "comment-threads",
      title: "Comment threads",
      description:
        "The comments on a spec: open and resolved filters, threads on a quote, mentions, reactions, edit, delete and resolve. A comment that says “fail” is refused, to see Retry and Discard.",
      covers: ["CommentThreadList", "CommentThread", "CommentComposer", "ReactionBar"],
    },
    {
      id: "comment-composer",
      title: "Comment thread and composer",
      description:
        "One thread on a field, and the composer on its own: mentions after @, a reply with Cancel, and disabled.",
      covers: ["CommentThread", "CommentComposer"],
    },
    {
      id: "version-history",
      title: "Version history",
      description:
        "Saved versions of a plan policy, previewed, compared against the current or the previous version as a diff, and restored.",
      covers: ["VersionHistory", "CodeDiff", "CodeBlock"],
    },
    {
      id: "entity-picker",
      title: "Entity picker",
      description:
        "People and projects found by a server function as you type, eight at a time with Show more: one, several up to a limit, create, required, invalid and disabled.",
      covers: ["EntityPicker"],
    },
    {
      id: "remote-search",
      title: "Remote search",
      description:
        "The search the picker runs, under a list of the app's own: debounced, the old request aborted, paged by a cursor.",
      covers: ["remoteSearch"],
    },
    {
      id: "image-field",
      title: "Image field and cropper",
      description:
        "A photo chosen, cropped and uploaded with its progress; a cover with aspect ratios; and the cropper on its own.",
      covers: ["ImageField", "ImageCropper", "cropImage"],
    },
    {
      id: "view-switcher",
      title: "View switcher and data views",
      description:
        "The same projects as a list, cards or a table, the view kept in the address, the search shared by every view.",
      covers: ["ViewSwitcher", "DataViews"],
    },
    {
      id: "docked-panels",
      title: "Docked panels",
      description:
        "Details, comments and history docked beside a document, resizable, a sheet on a narrow screen.",
      covers: ["DockedPanels", "DockedPanelToggle"],
    },
  ],
};
