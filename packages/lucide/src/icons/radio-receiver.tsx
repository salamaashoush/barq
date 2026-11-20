import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RadioReceiver(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 16v2" />
      <path d="M19 16v2" />
      <rect width="20" height="8" x="2" y="8" rx="2" />
      <path d="M18 12h.01" />
    </svg>
  );
}
