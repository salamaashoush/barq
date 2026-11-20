import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CloudLightning(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" />
      <path d="m13 12-3 5h4l-3 5" />
    </svg>
  );
}
