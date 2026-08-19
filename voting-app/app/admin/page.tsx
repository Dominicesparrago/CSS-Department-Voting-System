import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss, { type AtRule } from 'postcss';
import AdminRedesignConsole from '@/components/admin/AdminRedesignConsole';

const figtree = localFont({
  src: '../fonts/figtree-latin.woff2',
  weight: '300 900',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  weight: '400 600',
  display: 'swap',
});

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
  // Production-only: the mockup's universal reset is scoped to #admin-redesign * and
  // out-specifies the shared .live-data-status padding; restore it here.
  '#admin-redesign .live-data-status{padding:8px 14px}',
  '#admin-redesign .live-data-status.is-error{padding:8px 14px}',
  // Production-only (the mockup is a frozen reference): pin the desktop sidebar to the
  // viewport instead of the mockup's sticky-in-grid, and reserve its width on main.
  '@media(min-width:960px){',
  '#admin-redesign .shell{grid-template-columns:1fr}',
  '#admin-redesign .main{margin-left:252px}',
  '#admin-redesign .sidebar{position:fixed;inset:0 auto 0 0;width:252px;height:100dvh;overflow-y:auto;z-index:45;transform:none}',
  '}',
  // Hide scrollbars across the admin console. The scoped mockup body rule makes
  // #admin-redesign (not body) the scroll container (overflow-x:hidden computes
  // overflow-y to auto), so body:has() hiding alone is insufficient — cover the
  // page, the sidebar, and the side nav directly.
  '#admin-redesign{scrollbar-width:none;-ms-overflow-style:none}',
  '#admin-redesign::-webkit-scrollbar{display:none}',
  '#admin-redesign .sidebar{scrollbar-width:none;-ms-overflow-style:none}',
  '#admin-redesign .sidebar::-webkit-scrollbar{display:none}',
  '#admin-redesign .side-nav{scrollbar-width:none;-ms-overflow-style:none}',
  '#admin-redesign .side-nav::-webkit-scrollbar{display:none}',
  // Production-only: compact position picker (CustomSelect replaces the 20-pill switch).
  '#admin-redesign .pos-select{max-width:340px;margin-bottom:18px}',
  // Production-only: LiveVoteSummary reuses .tby-row, but the mockup scopes a 60px-first-column
  // grid for the year-turnout rows. Give the live-vote rows the wide avatar/name layout and pin
  // the last item (winner tag / vote count) to the right-hand column even on 2-child rows.
  '#admin-redesign .live-vote-summary .tby-row{grid-template-columns:auto minmax(0,1fr) auto}',
  '#admin-redesign .live-vote-summary .tby-row>:last-child{grid-column:3}',
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
  // Production-only: roster page redesign. The summary metric strip reuses the
  // overview's .metrics/.metric pattern; these rules cover the rest of the page.
  '#admin-redesign .roster-grid{display:grid;gap:28px}',
  '@media(min-width:1040px){#admin-redesign .roster-grid{grid-template-columns:minmax(300px,370px) minmax(0,1fr);align-items:start}}',
  '#admin-redesign .roster-block+.roster-block{margin-top:28px;padding-top:28px;border-top:1px solid var(--line)}',
  '#admin-redesign .roster-block .block-label{margin-bottom:14px}',
  // import drop zone (the file input itself is the control)
  '#admin-redesign .drop-zone{position:relative;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;padding:16px;border:1.5px dashed var(--line-2);border-radius:var(--radius-md);background:rgba(10,14,15,.35);color:var(--muted);font-size:.84rem;font-weight:400;cursor:pointer;transition:border-color .2s var(--ease),background .2s var(--ease)}',
  '#admin-redesign .drop-zone:hover{border-color:var(--brand);background:rgba(34,184,160,.06)}',
  '#admin-redesign .drop-zone.disabled{opacity:.55;pointer-events:none}',
  '#admin-redesign .drop-zone input[type=file]{position:absolute;inset:0;width:100%;height:100%;min-height:0;padding:0;opacity:0;cursor:pointer}',
  '#admin-redesign .dz-ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(34,184,160,.1);border:1px solid var(--line-2);color:var(--brand);flex:0 0 auto}',
  '#admin-redesign .dz-t{display:grid;gap:3px;min-width:0}',
  '#admin-redesign .dz-t b{color:var(--light);font-weight:600;font-size:.92rem}',
  '#admin-redesign .dz-t small{color:var(--muted-soft);font-size:.78rem;line-height:1.45}',
  '#admin-redesign .dz-btn{justify-self:start;margin-top:4px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--line-2);border-radius:var(--radius-md);color:var(--light);font-size:.78rem;font-weight:600;background:rgba(255,255,255,.03);transition:border-color .2s var(--ease),background .2s var(--ease)}',
  '#admin-redesign .drop-zone:hover .dz-btn{border-color:var(--brand);background:rgba(34,184,160,.1)}',
  // import summary stat tiles + rejected-row disclosure
  '#admin-redesign .import-summary{margin-top:16px}',
  '#admin-redesign .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin-top:10px}',
  '#admin-redesign .fact{display:grid;gap:3px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius-md);background:rgba(10,14,15,.35)}',
  '#admin-redesign .fact .num{font-family:var(--font);font-weight:800;font-size:1.35rem;line-height:1.1;letter-spacing:-.02em}',
  '#admin-redesign .fact .num.warn{color:#ff6b81}',
  '#admin-redesign .fact .lbl{font-family:var(--mono);font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}',
  '#admin-redesign .rej-details{margin-top:12px}',
  '#admin-redesign .rej-toggle{display:inline-flex;align-items:center;color:var(--brand);font-family:var(--mono);font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;background:none;border:0;padding:4px 0;list-style:none}',
  '#admin-redesign .rej-toggle::-webkit-details-marker{display:none}',
  '#admin-redesign .rej-toggle:hover{color:var(--teal-200)}',
  // roster browser toolbar (kept separate from .roster-tools used by Candidates)
  '#admin-redesign .roster-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}',
  '#admin-redesign .roster-toolbar .search{flex:1 1 200px;min-width:170px;max-width:none}',
  '#admin-redesign .roster-toolbar .sort-select{flex:0 1 190px;min-width:170px}',
  '#admin-redesign .roster-toolbar .pos-switch{margin-bottom:0}',
  // selection column + bulk action bar
  '#admin-redesign .cell-check{width:1%;white-space:nowrap}',
  '#admin-redesign .cell-check input[type=checkbox]{width:18px;height:18px;min-height:0;padding:0;margin:0;accent-color:var(--brand);cursor:pointer}',
  '#admin-redesign tbody tr.is-sel{background:rgba(34,184,160,.08)}',
  '#admin-redesign .roster-bulkbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border:1px solid var(--line-2);border-radius:var(--radius-md);background:rgba(34,184,160,.07)}',
  '#admin-redesign .roster-bulkbar>span{font-size:.86rem;color:var(--muted)}',
  '#admin-redesign .roster-bulkbar>span b{color:var(--teal-200);font-weight:700}',
  '#admin-redesign .roster-bulkbar .head-actions{margin-left:auto}',
  // roster table cell content
  '#admin-redesign .rname{display:grid;gap:2px;min-width:0}',
  '#admin-redesign .rname b{font-weight:600;font-size:.94rem;color:var(--light);line-height:1.35}',
  '#admin-redesign .rname small{color:var(--muted-soft);font-size:.74rem;line-height:1.3}',
  '#admin-redesign .rsec{font-weight:500;font-size:.86rem}',
  '#admin-redesign .rsec small{display:block;color:var(--muted);font-size:.72rem;margin-top:1px}',
  '#admin-redesign .mono-id{font-family:var(--mono);font-size:.78rem;color:var(--muted)}',
  // status badges (.tag-win is the shared green pill; muted + amber are new)
  '#admin-redesign .tag-muted{display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);font-family:var(--mono);font-size:.62rem;font-weight:600;white-space:nowrap}',
  '#admin-redesign .tag-warn{display:inline-block;padding:3px 10px;border-radius:999px;color:#f5c451;border:1px solid rgba(245,196,81,.35);background:rgba(245,196,81,.08);font-family:var(--mono);font-size:.62rem;font-weight:600;white-space:nowrap}',
  // roster table sizing/density
  '#admin-redesign .roster-browse{min-width:0}',
  '#admin-redesign .roster-browse table{min-width:820px}',
  '#admin-redesign .roster-browse th,#admin-redesign .roster-browse td{padding:12px 12px}',
  '#admin-redesign .roster-browse th:first-child,#admin-redesign .roster-browse td:first-child{padding-left:14px}',
  '#admin-redesign .roster-browse th:last-child,#admin-redesign .roster-browse td:last-child{text-align:right;padding-right:14px}',
  '#admin-redesign .row-act{width:34px;height:34px;min-height:34px;padding:0;border-radius:9px}',
  // contain the roster table in a fixed-height scroll region so "Show more"
  // pages within the table instead of pushing the page itself out of view
  '#admin-redesign .roster-scroll{max-height:clamp(320px,58vh,700px);overflow:auto;border:1px solid var(--line);border-radius:var(--radius-md);background:rgba(10,14,15,.35);scrollbar-width:thin;scrollbar-color:rgba(34,184,160,.45) transparent}',
  '#admin-redesign .roster-scroll thead th{position:sticky;top:0;z-index:2;background:rgba(10,14,15,.97)}',
  '#admin-redesign .roster-scroll .state-block{border:0;background:none;border-radius:0}',
  // custom scrollbar inside the roster container (webkit + firefox)
  '#admin-redesign .roster-scroll::-webkit-scrollbar,#admin-redesign .roster-scroll .twrap::-webkit-scrollbar{width:10px;height:10px}',
  '#admin-redesign .roster-scroll::-webkit-scrollbar-track,#admin-redesign .roster-scroll .twrap::-webkit-scrollbar-track{background:transparent}',
  '#admin-redesign .roster-scroll::-webkit-scrollbar-thumb,#admin-redesign .roster-scroll .twrap::-webkit-scrollbar-thumb{background:rgba(34,184,160,.35);border-radius:999px;border:2px solid transparent;background-clip:padding-box}',
  '#admin-redesign .roster-scroll::-webkit-scrollbar-thumb:hover,#admin-redesign .roster-scroll .twrap::-webkit-scrollbar-thumb:hover{background:rgba(34,184,160,.6);border:2px solid transparent;background-clip:padding-box}',
  '#admin-redesign .roster-scroll::-webkit-scrollbar-corner,#admin-redesign .roster-scroll .twrap::-webkit-scrollbar-corner{background:transparent}',
  // hide the page scrollbar while the admin console is mounted (content still scrolls)
  'body:has(#admin-redesign){scrollbar-width:none;-ms-overflow-style:none}',
  'body:has(#admin-redesign)::-webkit-scrollbar{display:none}',
  // show-more footer + empty-state icon
  '#admin-redesign .roster-more{display:grid;justify-items:center;gap:8px;padding-top:16px}',
  '#admin-redesign .roster-more small{font-family:var(--mono);font-size:.62rem;letter-spacing:.04em;color:var(--muted-soft)}',
  '#admin-redesign .state-ic{color:var(--muted-soft)}',
].join('');

// Roster-specific layout corrections. Keep these scoped to the roster panel so
// the shared admin primitives retain their existing appearance on other pages.
const ROSTER_STYLE_OVERRIDES = `
  #admin-redesign [data-p="roster"]{min-width:0}
  #admin-redesign [data-p="roster"] .head{min-width:0}
  #admin-redesign [data-p="roster"] .head>div:first-child{min-width:0}
  #admin-redesign [data-p="roster"] .head-actions{align-items:center}
  #admin-redesign [data-p="roster"] .roster-grid{min-width:0}
  #admin-redesign [data-p="roster"] .roster-grid>div{min-width:0}
  #admin-redesign [data-p="roster"] .roster-toolbar{min-width:0}
  #admin-redesign [data-p="roster"] .roster-toolbar .search{flex:1 1 240px}
  #admin-redesign [data-p="roster"] .roster-toolbar .sort-select{flex:0 1 200px}
  #admin-redesign [data-p="roster"] .roster-toolbar .pos-switch{flex:0 0 auto}
  #admin-redesign [data-p="roster"] .roster-scroll{min-width:0}
  #admin-redesign [data-p="roster"] .roster-scroll .twrap{min-width:0;overflow-x:auto}
  #admin-redesign [data-p="roster"] .roster-scroll table{min-width:820px;table-layout:auto}
  #admin-redesign [data-p="roster"] th:nth-child(1),#admin-redesign [data-p="roster"] td:nth-child(1){width:42px}
  #admin-redesign [data-p="roster"] th:nth-child(2){min-width:180px}
  #admin-redesign [data-p="roster"] th:nth-child(3){width:118px}
  #admin-redesign [data-p="roster"] th:nth-child(4){width:118px}
  #admin-redesign [data-p="roster"] th:nth-child(n+5){width:112px}
  #admin-redesign [data-p="roster"] td:nth-child(3),#admin-redesign [data-p="roster"] td:nth-child(n+5){white-space:nowrap}
  #admin-redesign [data-p="roster"] .state-block{min-height:150px;align-content:center}
  @media(min-width:1180px){
    #admin-redesign [data-p="roster"] .roster-grid{grid-template-columns:minmax(320px,370px) minmax(0,1fr)}
  }
  @media(max-width:719px){
    #admin-redesign [data-p="roster"] .head-actions{width:100%}
    #admin-redesign [data-p="roster"] .head-actions .btn{flex:1 1 auto}
    #admin-redesign [data-p="roster"] .roster-toolbar .search,
    #admin-redesign [data-p="roster"] .roster-toolbar .sort-select,
    #admin-redesign [data-p="roster"] .roster-toolbar .pos-switch{flex:1 1 100%;max-width:none}
    #admin-redesign [data-p="roster"] .roster-toolbar .pos-switch{justify-content:flex-start}
  }
  @media(max-width:559px){
    #admin-redesign [data-p="roster"] .head-actions .btn{flex-basis:100%}
    #admin-redesign [data-p="roster"] .roster-bulkbar .head-actions{width:auto;margin-left:0}
    #admin-redesign [data-p="roster"] .roster-bulkbar .head-actions .btn{flex:0 1 auto}
  }
`;

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

  return `${root.toString()}\n#admin-redesign{position:relative;isolation:isolate;}\n${SHARED_COMPONENT_OVERRIDES}\n${ROSTER_STYLE_OVERRIDES}`;
}

export default function AdminPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: loadMockupStyles() }} />
      <AdminRedesignConsole
        fonts={{
          figtree: figtree.style.fontFamily,
          jetBrainsMono: jetBrainsMono.style.fontFamily,
        }}
      />
    </>
  );
}
