import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule } from 'postcss';
import AdminRedesignConsole from '@/components/admin/AdminRedesignConsole';

export const metadata: Metadata = {
  title: 'CSS Voting — Admin',
  description: 'Administration console for the CSS Departmental Voting System.',
};

// The scoped `#admin-redesign * { margin:0; padding:0; ... }` reset below outspecifies
// shared components.css classes (e.g. `.cselect-btn`) since ID-scoping raises its
// specificity above a plain class selector. Re-declare padding here for any shared
// component rendered inside #admin-redesign that isn't part of the mockup's own CSS.
const SHARED_COMPONENT_OVERRIDES = [
  '#admin-redesign .cselect-btn{padding:12px 16px}',
  // Production-only (the mockup is a frozen reference): pin the desktop sidebar to the
  // viewport instead of the mockup's sticky-in-grid, and reserve its width on main.
  '@media(min-width:960px){',
  '#admin-redesign .shell{grid-template-columns:1fr}',
  '#admin-redesign .main{margin-left:252px}',
  '#admin-redesign .sidebar{position:fixed;inset:0 auto 0 0;width:252px;height:100dvh;overflow-y:auto;z-index:45}',
  '}',
  // Production-only: compact position picker (CustomSelect replaces the 20-pill switch).
  '#admin-redesign .pos-select{max-width:340px;margin-bottom:18px}',
  '#admin-redesign .field{display:grid;gap:6px}',
  '#admin-redesign .field>span{color:var(--muted);font-size:.82rem;font-weight:500}',
  // Production-only: candidate photo preview must clip inside its 84px tile.
  // (percentage height cannot resolve in .prev's auto grid row, so position the img absolutely)
  '#admin-redesign .prev{position:relative;overflow:hidden}',
  '#admin-redesign .prev img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}',
  // Production-only: department-logo brand mark (replaces the `>_` glyph tile).
  '#admin-redesign .has-logo{background:none;box-shadow:none}',
  '#admin-redesign .has-logo img{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 0 12px rgba(34,184,160,.35))}',
  // Production-only: roster tools row (search + sort dropdown side by side).
  '#admin-redesign .roster-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:8px}',
  '#admin-redesign .roster-tools .search{flex:1 1 200px;min-width:180px}',
  '#admin-redesign .roster-tools .sort-select{flex:0 1 190px;min-width:170px}',
  // Production-only: pre-election setup checklist (shown while the election is draft).
  '#admin-redesign .setup-list{list-style:none;margin:0;padding:0;display:grid}',
  '#admin-redesign .setup-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:16px 4px;border-top:1px solid var(--line)}',
  '#admin-redesign .setup-row:first-child{border-top:0}',
  '#admin-redesign .setup-dot{width:11px;height:11px;border-radius:50%;border:1.5px solid var(--line-2);flex:0 0 auto;transition:.2s}',
  '#admin-redesign .setup-row.done .setup-dot{background:var(--brand);border-color:var(--brand);box-shadow:0 0 8px var(--brand)}',
  '#admin-redesign .setup-row>div{min-width:0}',
  '#admin-redesign .setup-row b{font-weight:600;font-size:.96rem}',
  '#admin-redesign .setup-row .sv{color:var(--muted);font-size:.86rem}',
  '#admin-redesign .setup-row .btn{margin-left:auto}',
  '@media(max-width:560px){#admin-redesign .setup-row .btn{margin-left:21px;flex-basis:100%;justify-content:center}}',
].join('');

function loadMockupStyles(): string {
  const source = readFileSync(
    path.resolve(process.cwd(), '..', 'mockups', 'admin-redesign.html'),
    'utf8',
  );
  const styles = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];

  if (!styles) {
    throw new Error('Unable to load styles from mockups/admin-redesign.html.');
  }

  const fontAwareStyles = styles
    .replace(
      "--font:'Figtree','Segoe UI',Arial,sans-serif",
      "--font:var(--font-figtree),'Figtree','Segoe UI',Arial,sans-serif",
    )
    .replace(
      "--mono:'JetBrains Mono',ui-monospace,monospace",
      "--mono:var(--font-jetbrains-mono),'JetBrains Mono',ui-monospace,monospace",
    );

  const root = postcss.parse(fontAwareStyles);
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) return;

    rule.selectors = rule.selectors.map((selector) => {
      const trimmed = selector.trim();
      if (trimmed === ':root' || trimmed === 'html' || trimmed === 'body') {
        return '#admin-redesign';
      }
      if (trimmed.startsWith('body')) {
        return trimmed.replace(/^body/, '#admin-redesign');
      }
      if (trimmed.startsWith('::')) {
        return `#admin-redesign ${trimmed}`;
      }
      return `#admin-redesign ${trimmed}`;
    });
  });

  return `${root.toString()}\n#admin-redesign{position:relative;isolation:isolate;}\n${SHARED_COMPONENT_OVERRIDES}`;
}

export default function AdminPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: loadMockupStyles() }} />
      <AdminRedesignConsole />
    </>
  );
}
