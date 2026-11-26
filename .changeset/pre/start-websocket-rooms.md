---
"@barqjs/start": minor
---

`createWebSocketRooms` serves rooms for clients that encrypt end to end, the protocol of Excalidraw's collaboration server on plain WebSockets, through `upgradeWebSocket`.

- Peers join a room by id and hear who is first, who joined and who is in; broadcasts go to the rest of the room, volatile ones skip a peer that is behind.
- Follow rooms: a peer hears who follows it, and its broadcasts to its followers reach them alone.
- A room keeps its files and one stored state in memory, as the bytes it was sent, within size caps; a state is saved over the revision it was read at or answered with the newer one. A room nobody is in goes after `emptyRoomTtlMs`.
