import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FaceNeutral(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 10V9" />
      <path d="M8 16h8" />
      <path d="M9 10V9" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
