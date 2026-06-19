import { Fragment, type ReactNode } from "react";

export function renderBody(body: string): ReactNode[] {
  const re = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key++}>{body.slice(last, match.index)}</Fragment>);
    }
    nodes.push(
      <span key={key++} className="rounded bg-brand/10 px-1 font-medium text-brand">
        @{match[1]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < body.length) {
    nodes.push(<Fragment key={key++}>{body.slice(last)}</Fragment>);
  }
  return nodes;
}
