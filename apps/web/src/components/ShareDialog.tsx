import { useEffect, useState } from "react";
import {
  X,
  Link2,
  Copy,
  Check,
  Loader2,
  History,
  Globe,
  Building2,
} from "lucide-react";
import {
  api,
  type Collaborator,
  type DocRole,
  type ShareLinkDTO,
  type ShareScope,
  type AuditEventDTO,
} from "../lib/api";

const SHARE_ROLES: { value: DocRole; label: string }[] = [
  { value: "EDITOR", label: "Editor" },
  { value: "COMMENTER", label: "Commenter" },
  { value: "VIEWER", label: "Viewer" },
];

const EXPIRY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Never expires" },
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function describeEvent(e: AuditEventDTO) {
  const who = e.actor?.name ?? "Someone";
  const meta = (e.metadata ?? {}) as Record<string, unknown>;
  switch (e.action) {
    case "share.invite":
      return `${who} invited ${meta.email ?? "a user"} as ${meta.role}`;
    case "share.role_change":
      return `${who} changed a collaborator to ${meta.role}`;
    case "share.remove":
      return `${who} removed a collaborator`;
    case "link.create":
      return `${who} created a share link`;
    case "link.update":
      return `${who} updated the share link`;
    case "link.revoke":
      return `${who} revoked the share link`;
    case "link.claim":
      return `${who} joined via share link as ${meta.role}`;
    default:
      return `${who}: ${e.action}`;
  }
}

export default function ShareDialog({
  docId,
  docTitle,
  onClose,
}: {
  docId: string;
  docTitle: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [link, setLink] = useState<ShareLinkDTO | null>(null);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<DocRole>("EDITOR");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [savingLink, setSavingLink] = useState(false);

  const [showAudit, setShowAudit] = useState(false);
  const [events, setEvents] = useState<AuditEventDTO[] | null>(null);

  useEffect(() => {
    api.shares
      .list(docId)
      .then((d) => {
        setCollaborators(d.collaborators);
        setLink(d.link);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [docId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const { collaborator } = await api.shares.invite(docId, email.trim(), inviteRole);
      setCollaborators((prev) => [
        ...prev.filter((c) => c.id !== collaborator.id),
        collaborator,
      ]);
      setEmail("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: DocRole) {
    setCollaborators((prev) =>
      prev.map((c) => (c.id === userId ? { ...c, role } : c))
    );
    await api.shares.setRole(docId, userId, role).catch((e) => setError((e as Error).message));
  }

  async function removeCollaborator(userId: string) {
    setCollaborators((prev) => prev.filter((c) => c.id !== userId));
    await api.shares.remove(docId, userId).catch((e) => setError((e as Error).message));
  }

  async function saveLink(patch: Parameters<typeof api.shareLink.save>[1]) {
    setSavingLink(true);
    setError(null);
    try {
      setLink(await api.shareLink.save(docId, patch));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingLink(false);
    }
  }

  async function revokeLink() {
    await api.shareLink.revoke(docId).catch((e) => setError((e as Error).message));
    setLink(null);
  }

  function copyLink() {
    if (!link) return;
    const url = `${window.location.origin}/shared/${link.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function toggleAudit() {
    const next = !showAudit;
    setShowAudit(next);
    if (next && events === null) {
      api.shares.audit(docId).then(setEvents).catch(() => setEvents([]));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Share</h2>
            <p className="truncate text-xs text-muted">{docTitle || "Untitled"}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <form onSubmit={invite} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as DocRole)}
              className="rounded-lg border border-border bg-canvas px-2 py-2 text-sm outline-none focus:border-brand"
            >
              {SHARE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {inviting ? <Loader2 size={16} className="animate-spin" /> : "Invite"}
            </button>
          </form>

          <div className="mt-4 space-y-1">
            {loading ? (
              <div className="flex justify-center py-6 text-muted">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              collaborators.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-semibold text-white">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      initials(c.name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.name}
                      {c.isYou && <span className="text-muted"> (you)</span>}
                    </p>
                    <p className="truncate text-xs text-muted">{c.email}</p>
                  </div>
                  {c.role === "OWNER" ? (
                    <span className="rounded-md px-2 py-1 text-xs font-medium text-muted">Owner</span>
                  ) : (
                    <>
                      <select
                        value={c.role}
                        onChange={(e) => changeRole(c.id, e.target.value as DocRole)}
                        className="rounded-md border border-border bg-canvas px-1.5 py-1 text-xs outline-none focus:border-brand"
                      >
                        {SHARE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeCollaborator(c.id)}
                        aria-label={`Remove ${c.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-5 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-muted" />
              <span className="flex-1 text-sm font-medium">Share link</span>
              {link ? (
                <button
                  onClick={revokeLink}
                  className="text-xs text-muted transition-colors hover:text-danger"
                >
                  Revoke
                </button>
              ) : (
                <button
                  onClick={() => saveLink({ role: "VIEWER", scope: "ANYONE" })}
                  disabled={savingLink}
                  className="rounded-md bg-surface-muted px-2.5 py-1 text-xs font-medium transition-colors hover:bg-border disabled:opacity-50"
                >
                  {savingLink ? "Creating…" : "Create link"}
                </button>
              )}
            </div>

            {link && (
              <div className="mt-3 space-y-2.5">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/shared/${link.token}`}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-xs text-muted outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted"
                  >
                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={link.role}
                    onChange={(e) => saveLink({ role: e.target.value as DocRole })}
                    className="rounded-md border border-border bg-canvas px-1.5 py-1 outline-none focus:border-brand"
                  >
                    {SHARE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        Can {r.label.toLowerCase()}
                      </option>
                    ))}
                  </select>

                  <select
                    value={link.scope}
                    onChange={(e) => saveLink({ scope: e.target.value as ShareScope })}
                    className="rounded-md border border-border bg-canvas px-1.5 py-1 outline-none focus:border-brand"
                  >
                    <option value="ANYONE">Anyone with the link</option>
                    <option value="WORKSPACE">Workspace members only</option>
                  </select>

                  <select
                    value={link.expiresAt ? "custom" : "null"}
                    onChange={(e) =>
                      saveLink({
                        expiresInDays:
                          e.target.value === "null" ? null : Number(e.target.value),
                      })
                    }
                    className="rounded-md border border-border bg-canvas px-1.5 py-1 outline-none focus:border-brand"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={String(o.value)} value={o.value === null ? "null" : o.value}>
                        {o.label}
                      </option>
                    ))}
                    {link.expiresAt && <option value="custom">Custom</option>}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted">
                  {link.scope === "ANYONE" ? <Globe size={13} /> : <Building2 size={13} />}
                  <span>
                    {link.scope === "ANYONE"
                      ? "Anyone with this link can open the document."
                      : "Only people in your workspace can open this link."}
                  </span>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={link.hasPassword}
                    onChange={(e) =>
                      saveLink({ password: e.target.checked ? prompt("Set a password") || null : null })
                    }
                  />
                  Require a password
                </label>
              </div>
            )}
          </div>

          <button
            onClick={toggleAudit}
            className="mt-4 flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
          >
            <History size={13} />
            {showAudit ? "Hide activity" : "View activity"}
          </button>

          {showAudit && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-canvas p-3">
              {events === null ? (
                <div className="flex justify-center py-2 text-muted">
                  <Loader2 size={15} className="animate-spin" />
                </div>
              ) : events.length === 0 ? (
                <p className="text-xs text-muted">No activity yet.</p>
              ) : (
                events.map((e) => (
                  <p key={e.id} className="text-xs text-muted">
                    {describeEvent(e)}
                    <span className="text-muted/60">
                      {" · "}
                      {new Date(e.createdAt).toLocaleDateString()}
                    </span>
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
