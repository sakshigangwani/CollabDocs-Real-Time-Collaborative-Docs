import { Cloud, CloudOff, Loader2, AlertTriangle, Eye } from "lucide-react";
import {
  type ConnStatus,
  type Peer,
  type PeerStatus,
  initials,
} from "../lib/collab";

const STATUS_RING: Record<PeerStatus, string> = {
  active: "ring-success",
  idle: "ring-amber-400",
  away: "ring-border",
};

const STATUS_LABEL: Record<PeerStatus, string> = {
  active: "Active",
  idle: "Idle",
  away: "Away",
};

function Avatar({
  peer,
  following,
  onClick,
}: {
  peer: Peer;
  following: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${peer.name} · ${STATUS_LABEL[peer.status]}${
        peer.typing ? " · typing…" : ""
      }${following ? " · following" : " (click to follow)"}`}
      className={
        "relative -ml-2 flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 transition-transform first:ml-0 hover:z-10 hover:scale-110 " +
        STATUS_RING[peer.status] +
        (following ? " outline outline-2 outline-offset-1 outline-brand" : "")
      }
      style={{
        backgroundColor: peer.color,
        opacity: peer.status === "away" ? 0.55 : 1,
      }}
    >
      {initials(peer.name)}
      {peer.typing && (
        <span className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-surface">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
        </span>
      )}
    </button>
  );
}

export function PresenceStack({
  me,
  peers,
  followClientId,
  onFollow,
}: {
  me: { name: string; color: string };
  peers: Peer[];
  followClientId: number | null;
  onFollow: (clientId: number) => void;
}) {
  const typingNames = peers.filter((p) => p.typing).map((p) => p.name);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        <div
          title={`${me.name} (you)`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-brand"
          style={{ backgroundColor: me.color }}
        >
          {initials(me.name)}
        </div>
        {peers.map((p) => (
          <Avatar
            key={p.clientId}
            peer={p}
            following={followClientId === p.clientId}
            onClick={() => onFollow(p.clientId)}
          />
        ))}
      </div>
      {typingNames.length > 0 && (
        <span className="hidden text-xs italic text-muted lg:inline">
          {typingNames.length === 1
            ? `${typingNames[0]} is typing…`
            : `${typingNames.length} people typing…`}
        </span>
      )}
    </div>
  );
}

export function SyncBadge({ status }: { status: ConnStatus }) {
  if (status === "connecting")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" />
        Connecting…
      </span>
    );
  if (status === "disconnected")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400">
        <CloudOff size={12} />
        Offline
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs text-danger">
        <AlertTriangle size={12} />
        Sync error
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success">
      <Cloud size={12} />
      Synced
    </span>
  );
}

export function FollowingBanner({
  name,
  onStop,
}: {
  name: string;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 bg-brand/10 px-4 py-1.5 text-xs text-brand">
      <span className="inline-flex items-center gap-1.5">
        <Eye size={13} />
        Following {name}
      </span>
      <button
        onClick={onStop}
        className="rounded-md px-2 py-0.5 font-medium underline-offset-2 hover:underline"
      >
        Stop
      </button>
    </div>
  );
}

export function ConnectionBanner({ status }: { status: ConnStatus }) {
  if (status === "disconnected")
    return (
      <div className="flex items-center justify-center gap-2 bg-amber-400/15 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">
        <CloudOff size={13} />
        Connection lost — reconnecting. Your changes are saved offline and will
        sync automatically.
      </div>
    );
  if (status === "error")
    return (
      <div className="flex items-center justify-center gap-2 bg-danger/10 px-4 py-1.5 text-xs text-danger">
        <AlertTriangle size={13} />
        Can't sync this document — your access may have expired. Try reloading.
      </div>
    );
  return null;
}
