import { createFileRoute } from "@barqjs/router";
import { createWebSocketRooms, upgradeWebSocket } from "@barqjs/start";

/**
 * The gallery's rooms: chat messages and typing between tabs, relayed as the
 * room protocol frames them. Small limits, since nothing here is stored.
 */
const rooms = createWebSocketRooms({
  maxFileBytes: 256 * 1024,
  maxRoomFileBytes: 1024 * 1024,
  maxSnapshotBytes: 256 * 1024,
  emptyRoomTtlMs: 10 * 60 * 1000,
});

export const Route = createFileRoute("/api/room")({
  server: {
    handlers: {
      GET: ({ request }) => upgradeWebSocket(request, rooms.hooks),
    },
  },
});
