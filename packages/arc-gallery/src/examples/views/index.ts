import type { Demos } from "../../gallery/types.ts";
import BulkActions from "./bulk-actions.tsx";
import bulkActions from "./bulk-actions.tsx?raw";
import GroupedList from "./grouped-list.tsx";
import groupedList from "./grouped-list.tsx?raw";
import InheritedScope from "./inherited-scope.tsx";
import inheritedScope from "./inherited-scope.tsx?raw";
import ListPage from "./list-page.tsx";
import listPage from "./list-page.tsx?raw";
import PhoneCards from "./phone-cards.tsx";
import phoneCards from "./phone-cards.tsx?raw";
import SegmentedControl from "./segmented-control.tsx";
import segmentedControl from "./segmented-control.tsx?raw";
import TableCells from "./table-cells.tsx";
import tableCells from "./table-cells.tsx?raw";
import TableStates from "./table-states.tsx";
import tableStates from "./table-states.tsx?raw";
import TimeRange from "./time-range.tsx";
import timeRange from "./time-range.tsx?raw";

export const demos: Demos = {
  "list-page": { component: ListPage, code: listPage },
  "segmented-control": { component: SegmentedControl, code: segmentedControl },
  "time-range": { component: TimeRange, code: timeRange },
  "table-states": { component: TableStates, code: tableStates },
  "phone-cards": { component: PhoneCards, code: phoneCards },
  "bulk-actions": { component: BulkActions, code: bulkActions },
  "table-cells": { component: TableCells, code: tableCells },
  "grouped-list": { component: GroupedList, code: groupedList },
  "inherited-scope": { component: InheritedScope, code: inheritedScope },
};
