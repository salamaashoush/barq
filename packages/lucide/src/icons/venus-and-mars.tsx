import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function VenusAndMars(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 20h4" />
      <path d="M12 16v6" />
      <path d="M17 2h4v4" />
      <path d="m21 2-5.46 5.46" />
      <circle cx="12" cy="11" r="5" />
    </svg>
  );
}
