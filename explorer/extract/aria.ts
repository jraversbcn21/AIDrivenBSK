export interface AriaNode {
  role: string;
  name?: string;
  url?: string;
  text?: string;
  children: AriaNode[];
}

// Entry shapes (probed on Playwright 1.61 — see the design spec):
//   - role
//   - role "name" [attr] [attr=value]:
//   - text: free text
//   - /url: /some/path            (child of a link)
//   - 'role "name with: colon"':  (single-quote-wrapped when the entry contains a colon)
const ENTRY_RE = /^(?<role>[A-Za-z][\w-]*)(?:\s+"(?<name>(?:[^"\\]|\\.)*)")?(?<rest>.*)$/;

function unquote(content: string): string {
  if (content.startsWith("'")) {
    const end = content.lastIndexOf("'");
    if (end > 0) return content.slice(1, end) + content.slice(end + 1);
  }
  return content;
}

export function parseAriaSnapshot(snapshot: string): AriaNode[] {
  const roots: AriaNode[] = [];
  // Stack of [indentLevel, node] — children are 2 spaces deeper than their parent.
  const stack: Array<[number, AriaNode]> = [];

  for (const rawLine of snapshot.split('\n')) {
    if (!rawLine.trim()) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    const content = unquote(line.slice(2).trim());

    while (stack.length > 0 && stack[stack.length - 1][0] >= indent) stack.pop();
    const parent = stack.length > 0 ? stack[stack.length - 1][1] : undefined;
    const siblings = parent ? parent.children : roots;

    if (content.startsWith('/url:')) {
      if (parent) parent.url = content.slice('/url:'.length).trim();
      continue;
    }
    if (content.startsWith('text:')) {
      siblings.push({ role: 'text', text: content.slice('text:'.length).trim(), children: [] });
      continue;
    }

    const m = ENTRY_RE.exec(content);
    if (!m?.groups) continue;
    const node: AriaNode = { role: m.groups.role, children: [] };
    if (m.groups.name !== undefined) node.name = m.groups.name.replace(/\\(.)/g, '$1');
    // Inline text after a nameless landmark ("contentinfo: info") becomes a text child.
    const rest = m.groups.rest.replace(/\s*\[[^\]]*\]/g, '').trim();
    if (rest.startsWith(':') && rest.length > 1) {
      node.children.push({ role: 'text', text: rest.slice(1).trim(), children: [] });
    }
    siblings.push(node);
    stack.push([indent, node]);
  }
  return roots;
}
