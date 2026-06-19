export type PeerStatus = "active" | "idle" | "away";

export type Peer = {
  clientId: number;
  userId?: string;
  name: string;
  color: string;
  status: PeerStatus;
  typing: boolean;
};

export type ConnStatus = "connecting" | "connected" | "disconnected" | "error";

export function computeStatus(
  lastActive: number | undefined,
  now: number
): PeerStatus {
  if (!lastActive) return "active";
  const delta = now - lastActive;
  if (delta < 30000) return "active";
  if (delta < 120000) return "idle";
  return "away";
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const text = parts.map((w) => w[0]?.toUpperCase() ?? "").join("");
  return text || "?";
}
