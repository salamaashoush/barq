import type { Demos } from "../../gallery/types.ts";
import ConversationLayout from "./conversation-layout.tsx";
import conversationLayout from "./conversation-layout.tsx?raw";
import DetailSheetSteps from "./detail-sheet-steps.tsx";
import detailSheetSteps from "./detail-sheet-steps.tsx?raw";
import ListDetail from "./list-detail.tsx";
import listDetail from "./list-detail.tsx?raw";
import MasterDetail from "./master-detail.tsx";
import masterDetail from "./master-detail.tsx?raw";
import RecordPage from "./record-page.tsx";
import recordPage from "./record-page.tsx?raw";

export const demos: Demos = {
  "record-page": { component: RecordPage, code: recordPage },
  "detail-sheet-steps": { component: DetailSheetSteps, code: detailSheetSteps },
  "list-detail": { component: ListDetail, code: listDetail },
  "master-detail": { component: MasterDetail, code: masterDetail },
  "conversation-layout": { component: ConversationLayout, code: conversationLayout },
};
