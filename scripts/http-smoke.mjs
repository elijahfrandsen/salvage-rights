import { createGameServer } from "../dist/apps/server/src/http.js";
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
const game = createGameServer({
  production: true,
  origin: "https://salvage.example",
});
await new Promise((resolve) => game.http.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${game.http.address().port}`;
const response = await fetch(url + "/room/ABC234"),
  html = await response.text();
if (
  !html.includes("https://salvage.example/social.png") ||
  !html.includes("https://salvage.example/room/ABC234")
)
  throw new Error("Share metadata missing");
const image = await fetch(url + "/social.png");
if (image.status !== 200 || image.headers.get("content-type") !== "image/png")
  throw new Error("Social image unavailable");
if (
  JSON.stringify(await (await fetch(url + "/healthz")).json()) !== '{"ok":true}'
)
  throw new Error("Health information leak");
const denied = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
  headers: { Origin: "https://evil.invalid" },
});
if (denied.status !== 403) throw new Error("Forbidden origin accepted");
const socket = io(url, {
  transports: ["websocket"],
  extraHeaders: { Origin: "https://salvage.example" },
  reconnection: false,
});
await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("connect_error", reject);
});
const ack = await new Promise((resolve) =>
  socket.emit(
    "room:create",
    { requestId: randomUUID(), name: "Smoke Captain", shipId: "tug" },
    resolve,
  ),
);
if (!ack.ok || socket.io.engine.transport.name !== "websocket")
  throw new Error("Production websocket failed");
socket.disconnect();
await game.close();
console.log(
  "Compiled production server: health, SPA share-route refresh, absolute metadata, PNG, origin rejection, and real WebSocket creation passed. Public TLS/WSS remains unverified.",
);
