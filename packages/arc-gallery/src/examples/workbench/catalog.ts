import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "workbench",
  title: "Workbench panels",
  description:
    "The frame of a one-screen app and the panels around its editor: problems by file, test results with their diffs, a prover's verdicts, the status bar, a link that carries the workspace, and commands bound to their keys.",
  examples: [
    {
      id: "workbench-frame",
      title: "Workbench frame",
      description:
        "A bar, an editor and an output panel split by a handle, and the status bar, each panel scrolling inside itself rather than growing the page.",
      covers: ["Workbench", "StatusBar"],
    },
    {
      id: "problems",
      title: "Problems",
      description:
        "A checker's errors, warnings, notes and hints grouped by file, counted and filtered, each one a press from its line.",
      covers: ["ProblemsPanel", "problemCounts", "SourceLocation"],
    },
    {
      id: "test-results",
      title: "Test results",
      description:
        "Suites and tests with their status and time, a failure's expected and received values in a diff, and runs of one test, all, or the failed ones.",
      covers: ["TestResults", "testCounts", "testStatus"],
    },
    {
      id: "check-results",
      title: "Check results",
      description:
        "Properties proved, falsified with the values that break them, unknown, failed or out of time, and a verdict of the checker's own.",
      covers: ["CheckResults", "counterexampleText"],
    },
    {
      id: "status-bar",
      title: "Status bar",
      description:
        "Problem counts that open the problems, background tasks with and without an end, the caret, the language, and the caller's own items.",
      covers: ["StatusBar", "StatusBarItem"],
    },
    {
      id: "share-dialog",
      title: "Share a workspace",
      description:
        "The workspace compressed into the link's hash, its length and how far it shrank, copied in one press.",
      covers: ["ShareDialog", "urlStateLink", "readUrlState"],
    },
    {
      id: "command-keys",
      title: "Commands with keys",
      description:
        "A command menu whose actions' keys work from anywhere on the page, a sequence included.",
      covers: ["CommandMenu", "useCommands"],
    },
    {
      id: "workbench-states",
      title: "Empty, loading and failed",
      description:
        "Each panel before anything is known, with nothing to show, and when its tool fails.",
      covers: ["ProblemsPanel", "TestResults", "CheckResults"],
    },
  ],
};
