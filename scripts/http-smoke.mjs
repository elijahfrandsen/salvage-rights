import { createGameServer } from "../dist/apps/server/src/http.js";
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
const publicUrl = process.env.PUBLIC_TEST_URL;
const origin = publicUrl ?? "https://salvage.example";
const game = publicUrl
  ? undefined
  : createGameServer({
      production: true,
      origin,
    });
if (game)
  await new Promise((resolve) => game.http.listen(0, "127.0.0.1", resolve));
const url = publicUrl ?? `http://127.0.0.1:${game.http.address().port}`;
const response = await fetch(url + "/room/ABC234"),
  html = await response.text();
if (
  !html.includes(`${origin}/social.png`) ||
  !html.includes(`${origin}/room/ABC234`)
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
  extraHeaders: { Origin: origin },
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
if (game) await game.close();
console.log(
  publicUrl
    ? "Public HTTPS health, SPA share-route refresh, absolute metadata, PNG, origin rejection, and real WSS room creation passed."
    : "Compiled production server: health, SPA share-route refresh, absolute metadata, PNG, origin rejection, and real WebSocket creation passed. Public TLS/WSS remains unverified.",
);
