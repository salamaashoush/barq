import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mails(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 1-1.732" />
      <path d="m22 5.5-6.419 4.179a2 2 0 0 1-2.162 0L7 5.5" />
      <rect x="7" y="3" width="15" height="12" rx="2" />
    </svg>
  );
}
