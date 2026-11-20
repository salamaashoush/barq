import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Cinema(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 22a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2" />
      <path d="M15.03 8.44a.65.65 0 0 1 0 1.12l-4.06 2.35a.64.64 0 0 1-.97-.56v-4.7a.647.647 0 0 1 .96-.56z" />
      <path d="M2 22a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2" />
      <rect x="2" y="2" width="20" height="14" rx="2" />
    </svg>
  );
}
