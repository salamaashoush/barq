import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TimerReset(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 2h4" />
      <path d="M12 14v-4" />
      <path d="M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6" />
      <path d="M9 17H4v5" />
    </svg>
  );
}
