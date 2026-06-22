import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Settings, Check, UserPlus, Crown, Trash2 } from "lucide-react";
import {
  api,
  type WorkspaceInfo,
  type WorkspaceMemberDTO,
  type WorkspaceRole,
  type BillingInfo,
  type DocRole,
} from "../lib/api";

export default function WorkspaceSettings() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [members, setMembers] = useState<WorkspaceMemberDTO[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [defaultRole, setDefaultRole] = useState<DocRole>("VIEWER");
  const [domains, setDomains] = useState("");
  const [saved, setSaved] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("MEMBER");
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    api.workspace
      .get()
      .then((wi) => {
        if (!wi.isAdmin) {
          setStatus("denied");
          return;
        }
        setInfo(wi);
        setName(wi.workspace.name);
        setLogoUrl(wi.workspace.logoUrl ?? "");
        setDefaultRole(wi.workspace.defaultRole);
        setDomains(wi.workspace.allowedDomains.join(", "));
        setStatus("ready");
        api.workspace.members().then(setMembers).catch(() => {});
        api.billing.get().then(setBilling).catch(() => {});
      })
      .catch(() => setStatus("error"));
  }, []);

  async function saveGeneral() {
    await api.workspace
      .update({
        name: name.trim(),
        logoUrl: logoUrl.trim() || null,
        defaultRole,
        allowedDomains: domains.split(",").map((d) => d.trim()).filter(Boolean),
      })
      .catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function reloadMembers() {
    setMembers(await api.workspace.members().catch(() => members));
  }

  async function invite() {
    setInviteError("");
    try {
      await api.workspace.invite(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await reloadMembers();
    } catch (e) {
      setInviteError((e as Error).message);
    }
  }

  async function checkout() {
    const res = await api.billing.checkout().catch(() => null);
    if (res?.url) window.location.href = res.url;
  }
  async function portal() {
    const res = await api.billing.portal().catch(() => null);
    if (res?.url) window.location.href = res.url;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (status !== "ready" || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-center">
        <h1 className="text-xl font-semibold">
          {status === "denied" ? "Admin access required" : "Couldn't load settings"}
        </h1>
        <button
          onClick={() => navigate("/home")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
        <button
          onClick={() => navigate("/home")}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <Settings size={16} className="text-muted" />
        <span className="text-sm font-medium">Workspace settings</span>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">General</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Workspace name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Logo URL</span>
              <div className="flex items-center gap-2">
                {logoUrl && (
                  <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                )}
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Default permission for new shares</span>
              <select
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value as DocRole)}
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="VIEWER">Viewer</option>
                <option value="COMMENTER">Commenter</option>
                <option value="EDITOR">Editor</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Allowed email domains (comma-separated)</span>
              <input
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="acme.com, example.org"
                className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <button
              onClick={saveGeneral}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
            >
              {saved ? <Check size={15} /> : null}
              {saved ? "Saved" : "Save changes"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Members</h2>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@email.com"
              className="flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              className="rounded-lg border border-border bg-canvas px-2 py-2 text-sm outline-none"
            >
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
              <option value="GUEST">Guest</option>
            </select>
            <button
              onClick={invite}
              disabled={!inviteEmail.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-50"
            >
              <UserPlus size={15} /> Invite
            </button>
          </div>
          {inviteError && <p className="mb-3 text-xs text-danger">{inviteError}</p>}

          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-semibold text-white">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.name}
                    {m.isOwner && <Crown size={12} className="text-warn" />}
                    {!m.active && <span className="text-xs text-muted">(deactivated)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                {m.isOwner ? (
                  <span className="text-xs font-medium text-muted">Owner</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={m.role}
                      onChange={async (e) => {
                        await api.workspace.setMember(m.id, { role: e.target.value as WorkspaceRole });
                        reloadMembers();
                      }}
                      className="rounded-lg border border-border bg-canvas px-2 py-1 text-xs outline-none"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                      <option value="GUEST">Guest</option>
                    </select>
                    <button
                      onClick={async () => {
                        await api.workspace.setMember(m.id, { deactivated: m.active });
                        reloadMembers();
                      }}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                    >
                      {m.active ? "Deactivate" : "Reactivate"}
                    </button>
                    {info.isOwner && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`Transfer ownership to ${m.name}?`)) {
                            await api.workspace.transfer(m.id);
                            window.location.reload();
                          }
                        }}
                        title="Make owner"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-warn"
                      >
                        <Crown size={14} />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        await api.workspace.removeMember(m.id);
                        reloadMembers();
                      }}
                      title="Remove"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Billing</h2>
          {billing && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">
                  Plan: <span className="font-semibold capitalize">{billing.plan}</span> · {billing.seats} seat
                  {billing.seats === 1 ? "" : "s"}
                </p>
                {!billing.configured && (
                  <p className="mt-1 text-xs text-muted">
                    Billing isn't configured. Add Stripe test keys to enable upgrades.
                  </p>
                )}
              </div>
              {billing.configured &&
                (billing.plan === "pro" ? (
                  <button onClick={portal} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
                    Manage billing
                  </button>
                ) : (
                  <button onClick={checkout} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-hover">
                    Upgrade to Pro
                  </button>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
