import type { Demos } from "../../gallery/types.ts";
import DataGrid from "./data-grid.tsx";
import dataGrid from "./data-grid.tsx?raw";
import DataTableStates from "./data-table-states.tsx";
import dataTableStates from "./data-table-states.tsx?raw";
import DataTable from "./data-table.tsx";
import dataTable from "./data-table.tsx?raw";
import DescriptionList from "./description-list.tsx";
import descriptionList from "./description-list.tsx?raw";
import KanbanBoard from "./kanban-board.tsx";
import kanbanBoard from "./kanban-board.tsx?raw";
import List from "./list.tsx";
import list from "./list.tsx?raw";
import People from "./people.tsx";
import people from "./people.tsx?raw";
import Reactions from "./reactions.tsx";
import reactions from "./reactions.tsx?raw";
import Stats from "./stats.tsx";
import stats from "./stats.tsx?raw";
import Tile from "./tile.tsx";
import tile from "./tile.tsx?raw";
import Timeline from "./timeline.tsx";
import timeline from "./timeline.tsx?raw";
import TreeView from "./tree-view.tsx";
import treeView from "./tree-view.tsx?raw";

export const demos: Demos = {
  "data-table": { component: DataTable, code: dataTable },
  "data-table-states": { component: DataTableStates, code: dataTableStates },
  "data-grid": { component: DataGrid, code: dataGrid },
  "tree-view": { component: TreeView, code: treeView },
  "kanban-board": { component: KanbanBoard, code: kanbanBoard },
  list: { component: List, code: list },
  timeline: { component: Timeline, code: timeline },
  "description-list": { component: DescriptionList, code: descriptionList },
  stats: { component: Stats, code: stats },
  tile: { component: Tile, code: tile },
  people: { component: People, code: people },
  reactions: { component: Reactions, code: reactions },
};
