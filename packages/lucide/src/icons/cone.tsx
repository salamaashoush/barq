import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Cone(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98" />
      <ellipse cx="12" cy="19" rx="9" ry="3" />
    </svg>
  );
}
