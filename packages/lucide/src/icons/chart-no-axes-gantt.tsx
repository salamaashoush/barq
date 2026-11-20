import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartNoAxesGantt(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 5h12" />
      <path d="M4 12h10" />
      <path d="M12 19h8" />
    </svg>
  );
}
