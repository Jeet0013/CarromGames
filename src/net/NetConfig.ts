/**
 * Connection settings for peer-to-peer play.
 *
 * ## Why this file exists
 *
 * Two browsers can usually find a direct path to each other with nothing but a
 * STUN server, which is free and public. Usually — but not on a good number of
 * mobile carriers, whose NAT assigns a different external port per destination.
 * A peer behind one of those cannot be reached directly at all, and the failure
 * is silent: the offer goes out, no answer comes back, and the connection sits
 * there looking like it is still trying.
 *
 * The fix is a TURN server, which relays the traffic when a direct path cannot
 * be found. There is no free public one worth relying on — relaying costs
 * bandwidth, so anyone offering it openly is either rate-limited or about to
 * disappear — so none is hardcoded here. What is here is the place to put one.
 *
 * Without TURN the game still works: same Wi-Fi, most home broadband, many
 * mobile networks. With it, it works everywhere. That is the whole difference,
 * and it is worth knowing which of the two you have shipped.
 */

/** A TURN or STUN entry, in the shape WebRTC expects. */
export interface IceServer {
  readonly urls: string | string[];
  readonly username?: string;
  readonly credential?: string;
}

/**
 * Add TURN entries here to allow play across networks that refuse a direct
 * connection. For example:
 *
 * ```ts
 * { urls: 'turn:turn.example.com:3478', username: 'carrom', credential: '…' }
 * ```
 *
 * Credentials in a browser bundle are readable by anyone who loads the page, so
 * use a service that issues short-lived ones rather than a permanent password.
 */
export const ICE_SERVERS: readonly IceServer[] = [
  // Public STUN. Enough for two peers that can see each other directly.
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/** Whether anything here can relay for a peer that cannot be reached directly. */
export const HAS_RELAY = ICE_SERVERS.some((server) =>
  (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) =>
    url.startsWith('turn:'),
  ),
);
