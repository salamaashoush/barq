import type { Demos } from "../../gallery/types.ts";
import Activity from "./activity.tsx";
import activity from "./activity.tsx?raw";
import ChangeLog from "./change-log.tsx";
import changeLog from "./change-log.tsx?raw";
import ChecklistEditor from "./checklist-editor.tsx";
import checklistEditor from "./checklist-editor.tsx?raw";
import MemberOrder from "./member-order.tsx";
import memberOrder from "./member-order.tsx?raw";
import Outline from "./outline.tsx";
import outline from "./outline.tsx?raw";
import PropertyList from "./property-list.tsx";
import propertyList from "./property-list.tsx?raw";
import SearchResults from "./search-results.tsx";
import searchResults from "./search-results.tsx?raw";
import SortableList from "./sortable-list.tsx";
import sortableList from "./sortable-list.tsx?raw";
import StepSequence from "./step-sequence.tsx";
import stepSequence from "./step-sequence.tsx?raw";

export const demos: Demos = {
  activity: { component: Activity, code: activity },
  "change-log": { component: ChangeLog, code: changeLog },
  "property-list": { component: PropertyList, code: propertyList },
  "sortable-list": { component: SortableList, code: sortableList },
  "checklist-editor": { component: ChecklistEditor, code: checklistEditor },
  "member-order": { component: MemberOrder, code: memberOrder },
  "step-sequence": { component: StepSequence, code: stepSequence },
  "search-results": { component: SearchResults, code: searchResults },
  outline: { component: Outline, code: outline },
};
