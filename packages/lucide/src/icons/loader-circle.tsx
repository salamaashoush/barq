import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LoaderCircle(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
