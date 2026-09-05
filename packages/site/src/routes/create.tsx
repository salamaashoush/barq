import { createFileRoute } from "@barqjs/router";

import { Designer } from "../gallery.tsx";

/**
 * NOT prerendered.
 *
 * The designer is the one page whose whole job is to change what it wears while
 * you look at it, and a prerendered copy would be a photograph of one
 * configuration served to everybody who asks for any of them.
 */
export const Route = createFileRoute("/create")({ component: Designer });
