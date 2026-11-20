import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HandTruck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15.614 7.108-2.115-4.53a1 1 0 0 0-1.329-.484l-2.3 1.073a1 1 0 0 0-.484 1.33l4.783 10.247a1 1 0 0 0 1.329.483l5.925-2.765a1 1 0 0 0 .483-1.329l-2.245-4.81a1 1 0 0 0-1.329-.484l-6.831 3.188" />
      <path d="M2 3.268a2 2 0 0 1 2.812.886l7 15a2 2 0 0 0 2.659.967L20 17.54" />
      <circle cx="10" cy="20" r="2" />
    </svg>
  );
}
