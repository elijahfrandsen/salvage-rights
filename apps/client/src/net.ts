import { io } from "socket.io-client";
import type { Ack } from "../../../packages/shared/src/types";
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  transports: ["websocket"],
  autoConnect: false,
  reconnectionDelay: 600,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});
export async function command(
  event: string,
  data: Record<string, unknown> = {},
  id: string = crypto.randomUUID(),
): Promise<Ack> {
  return new Promise((resolve) => {
    socket
      .timeout(7000)
      .emit(
        event,
        { requestId: id, ...data },
        (error: Error | null, ack: Ack) =>
          resolve(
            error
              ? {
                  ok: false,
                  requestId: id,
                  code: "TRANSPORT",
                  message:
                    "Orders were not confirmed. Reconnecting—please try again.",
                }
              : ack,
          ),
      );
  });
}
