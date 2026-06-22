import { generateHTML } from "@tiptap/core";
import TurndownService from "turndown";
import { renderExtensions } from "./docSchema";

export type ExportFormat = "html" | "markdown" | "docx" | "pdf";

function bodyHTML(content: unknown): string {
  try {
    return generateHTML(content as Record<string, unknown>, renderExtensions);
  } catch {
    return "<p></p>";
  }
}

const PAGE_CSS = `
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.7;
    max-width: 720px; margin: 40px auto; padding: 0 24px; color: #0f172a; }
  h1 { font-size: 2rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.25rem; }
  blockquote { border-left: 3px solid #cbd5e1; margin: 0; padding-left: 1rem; color: #475569; }
  table { border-collapse: collapse; } td, th { border: 1px solid #cbd5e1; padding: 6px 10px; }
  pre { background: #f1f5f9; padding: 12px; border-radius: 8px; overflow: auto; }
  code { background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 4px; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
`;

function fullDocument(title: string, content: unknown): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHTML(
    title,
  )}</title><style>${PAGE_CSS}</style></head><body><h1>${escapeHTML(
    title,
  )}</h1>${bodyHTML(content)}</body></html>`;
}

function escapeHTML(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function slug(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportHTML(title: string, content: unknown) {
  download(new Blob([fullDocument(title, content)], { type: "text/html" }), `${slug(title)}.html`);
}

export function exportMarkdown(title: string, content: unknown) {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const md = `# ${title}\n\n${turndown.turndown(bodyHTML(content))}\n`;
  download(new Blob([md], { type: "text/markdown" }), `${slug(title)}.md`);
}

export function exportDocx(title: string, content: unknown) {
  const inner = `<h1>${escapeHTML(title)}</h1>${bodyHTML(content)}`;
  const wordHTML = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHTML(
    title,
  )}</title><style>${PAGE_CSS}</style></head><body>${inner}</body></html>`;
  download(new Blob([wordHTML], { type: "application/msword" }), `${slug(title)}.doc`);
}

export function exportPDF(title: string, content: unknown) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(fullDocument(title, content));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function runExport(format: ExportFormat, title: string, content: unknown) {
  if (format === "html") return exportHTML(title, content);
  if (format === "markdown") return exportMarkdown(title, content);
  if (format === "docx") return exportDocx(title, content);
  return exportPDF(title, content);
}
