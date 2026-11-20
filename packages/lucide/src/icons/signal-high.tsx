import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SignalHigh(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
    </svg>
  );
}
