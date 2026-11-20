import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Sigma(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}
