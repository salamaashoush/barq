import type { Demos } from "../../gallery/types.ts";
import ChartMarks from "./chart-marks.tsx";
import chartMarks from "./chart-marks.tsx?raw";
import CountUp from "./count-up.tsx";
import countUp from "./count-up.tsx?raw";
import CustomStatus from "./custom-status.tsx";
import customStatus from "./custom-status.tsx?raw";
import LegendFilter from "./legend-filter.tsx";
import legendFilter from "./legend-filter.tsx?raw";
import LinkPreview from "./link-preview.tsx";
import linkPreview from "./link-preview.tsx?raw";
import Meters from "./meters.tsx";
import meters from "./meters.tsx?raw";
import ProfileCard from "./profile-card.tsx";
import profileCard from "./profile-card.tsx?raw";
import QuotedMessages from "./quoted-messages.tsx";
import quotedMessages from "./quoted-messages.tsx?raw";
import SegmentedBars from "./segmented-bars.tsx";
import segmentedBars from "./segmented-bars.tsx?raw";
import Signals from "./signals.tsx";
import signals from "./signals.tsx?raw";
import StagePath from "./stage-path.tsx";
import stagePath from "./stage-path.tsx?raw";
import StatCards from "./stat-cards.tsx";
import statCards from "./stat-cards.tsx?raw";
import TemplateGallery from "./template-gallery.tsx";
import templateGallery from "./template-gallery.tsx?raw";
import Uptime from "./uptime.tsx";
import uptime from "./uptime.tsx?raw";

export const demos: Demos = {
  "stat-cards": { component: StatCards, code: statCards },
  meters: { component: Meters, code: meters },
  "segmented-bars": { component: SegmentedBars, code: segmentedBars },
  uptime: { component: Uptime, code: uptime },
  signals: { component: Signals, code: signals },
  "stage-path": { component: StagePath, code: stagePath },
  "count-up": { component: CountUp, code: countUp },
  "chart-marks": { component: ChartMarks, code: chartMarks },
  "legend-filter": { component: LegendFilter, code: legendFilter },
  "profile-card": { component: ProfileCard, code: profileCard },
  "link-preview": { component: LinkPreview, code: linkPreview },
  "template-gallery": { component: TemplateGallery, code: templateGallery },
  "quoted-messages": { component: QuotedMessages, code: quotedMessages },
  "custom-status": { component: CustomStatus, code: customStatus },
};
