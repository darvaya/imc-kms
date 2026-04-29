import env from "~/env";

/**
 * Returns the path the Socket.IO presence connection should upgrade against.
 * Mirrors the server-side `path` constant in `server/services/websockets.ts`,
 * which derives from `env.BASE_PATH`. Extracted to its own module so unit
 * tests can import it without loading the decorated `WebsocketProvider` class.
 */
export function getRealtimePath(): string {
  return `${env.BASE_PATH ?? ""}/realtime`;
}
