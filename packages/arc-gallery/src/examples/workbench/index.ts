import type { Demos } from "../../gallery/types.ts";
import CheckResults from "./check-results.tsx";
import checkResults from "./check-results.tsx?raw";
import CommandKeys from "./command-keys.tsx";
import commandKeys from "./command-keys.tsx?raw";
import Problems from "./problems.tsx";
import problems from "./problems.tsx?raw";
import ShareDialog from "./share-dialog.tsx";
import shareDialog from "./share-dialog.tsx?raw";
import StatusBar from "./status-bar.tsx";
import statusBar from "./status-bar.tsx?raw";
import TestResults from "./test-results.tsx";
import testResults from "./test-results.tsx?raw";
import WorkbenchFrame from "./workbench-frame.tsx";
import workbenchFrame from "./workbench-frame.tsx?raw";
import WorkbenchStates from "./workbench-states.tsx";
import workbenchStates from "./workbench-states.tsx?raw";

export const demos: Demos = {
  "workbench-frame": { component: WorkbenchFrame, code: workbenchFrame },
  problems: { component: Problems, code: problems },
  "test-results": { component: TestResults, code: testResults },
  "check-results": { component: CheckResults, code: checkResults },
  "status-bar": { component: StatusBar, code: statusBar },
  "share-dialog": { component: ShareDialog, code: shareDialog },
  "command-keys": { component: CommandKeys, code: commandKeys },
  "workbench-states": { component: WorkbenchStates, code: workbenchStates },
};
