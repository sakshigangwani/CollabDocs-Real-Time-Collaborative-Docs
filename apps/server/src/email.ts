import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "CollabDocs <onboarding@resend.dev>";
const appUrl = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const resend = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(input: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.log(`[email skipped] to=${input.to} subject="${input.subject}"`);
    return { skipped: true };
  }
  try {
    await resend.emails.send({ from, to: input.to, subject: input.subject, html: input.html });
    return { sent: true };
  } catch (err) {
    console.error("[email error]", err);
    return { error: true };
  }
}

function shell(title: string, body: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="font-size:18px">${title}</h2>${body}
    <p style="margin-top:24px;font-size:12px;color:#64748b">You're receiving this from CollabDocs.
    Manage notifications at <a href="${appUrl}/notifications">${appUrl}/notifications</a>.</p>
  </div>`;
}

const VERB: Record<string, string> = {
  mention: "mentioned you in",
  reply: "replied to your comment in",
  comment: "commented on",
  share_invite: "shared a document with you",
  version_restored: "restored a version of",
};

export function instantEmailHTML(input: {
  actorName: string;
  type: string;
  docTitle: string;
  docId: string;
  snippet?: string | null;
}) {
  const verb = VERB[input.type] ?? "updated";
  const link = `${appUrl}/d/${input.docId}`;
  const snippet = input.snippet
    ? `<blockquote style="border-left:3px solid #cbd5e1;margin:12px 0;padding-left:12px;color:#475569">${escape(
        input.snippet,
      )}</blockquote>`
    : "";
  return shell(
    `${escape(input.actorName)} ${verb} “${escape(input.docTitle)}”`,
    `${snippet}<p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">Open document</a></p>`,
  );
}

export function digestEmailHTML(input: {
  items: { actorName: string; type: string; docTitle: string; docId: string }[];
}) {
  const rows = input.items
    .map((i) => {
      const verb = VERB[i.type] ?? "updated";
      return `<li style="margin:6px 0"><a href="${appUrl}/d/${i.docId}">${escape(
        i.actorName,
      )} ${verb} “${escape(i.docTitle)}”</a></li>`;
    })
    .join("");
  return shell(
    `Your CollabDocs digest — ${input.items.length} update${input.items.length === 1 ? "" : "s"}`,
    `<ul style="padding-left:18px">${rows}</ul>`,
  );
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
