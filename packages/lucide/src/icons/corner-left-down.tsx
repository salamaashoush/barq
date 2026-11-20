import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerLeftDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m14 15-5 5-5-5" />
      <path d="M20 4h-7a4 4 0 0 0-4 4v12" />
    </svg>
  );
}
