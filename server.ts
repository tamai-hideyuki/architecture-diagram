// architecture-diagram: ~/Projects/quad/knowledge/projects/<repo>/architecture.md をブラウザで表示する
// 起動: npm start  (ARCH_DIR / PORT で上書き可)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { marked } from 'marked';

const ARCH_DIR = process.env.ARCH_DIR ?? join(homedir(), 'Projects/quad/knowledge/projects');
const PORT = Number(process.env.PORT ?? 4747);
const MERMAID_JS = join(import.meta.dirname, 'node_modules/mermaid/dist/mermaid.min.js');

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Doc = { front: Record<string, string>; mermaid: string; infoHtml: string };

// frontmatter → front, 最初の ```mermaid ブロック → mermaid, 残り → marked で HTML
function parseDoc(md: string): Doc {
  const front: Record<string, string> = {};
  let body = md;
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(line);
      if (m) front[m[1]] = m[2].trim();
    }
    body = md.slice(fm[0].length);
  }
  let mermaid = '';
  body = body.replace(/```mermaid\n([\s\S]*?)```/, (_, code: string) => {
    mermaid = code.trim();
    return '';
  });
  return { front, mermaid, infoHtml: marked.parse(body, { async: false }) };
}

function listRepos(): string[] {
  if (!existsSync(ARCH_DIR)) return [];
  return readdirSync(ARCH_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ARCH_DIR, d.name, 'architecture.md')))
    .map((d) => d.name)
    .sort();
}

const CSS = `
:root{--bg:#ecdfff;--btn:#e4ccff;--btn-strong:#c9a3ff;--ink:#111}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;padding:28px 16px 16px;position:relative;z-index:2}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;font-size:16px;font-weight:700;line-height:1;background:var(--btn);color:var(--ink);border:2px solid var(--ink);border-radius:8px;box-shadow:4px 4px 0 var(--ink);cursor:pointer;text-decoration:none;user-select:none;font-family:inherit}
.btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}
.btn.strong{background:var(--btn-strong)}
details{position:relative}
details>summary{list-style:none}
details>summary::-webkit-details-marker{display:none}
.menu{position:absolute;top:calc(100% + 10px);left:0;min-width:220px;background:#fff;border:2px solid var(--ink);border-radius:8px;box-shadow:4px 4px 0 var(--ink);padding:8px;z-index:5}
.menu button,.menu a{display:block;width:100%;text-align:left;padding:10px 12px;background:none;border:0;border-radius:6px;font:inherit;font-weight:600;cursor:pointer;color:var(--ink);text-decoration:none}
.menu button:hover,.menu a:hover{background:var(--btn)}
.info{width:min(760px,92vw);max-height:65vh;overflow:auto;padding:12px 18px;font-weight:400;font-size:14px;line-height:1.55}
.info .meta{color:#666;font-size:12px;margin:0 0 8px}
.info table{border-collapse:collapse;width:100%}
.info th,.info td{border:1px solid #ddd;padding:6px 8px;text-align:left}
.info code{background:#f3eefb;padding:1px 4px;border-radius:4px}
main{padding:0 16px 40px}
#stage{position:relative;overflow:auto;min-height:60vh}
#stage.zoom{cursor:grab;overflow:hidden;border:2px dashed #b48cf0;border-radius:8px}
#stage svg{display:block;margin:0 auto;height:auto;transform-origin:0 0}
.err{background:#ffe3e3;border:2px solid #c00;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:ui-monospace,monospace}
.empty{text-align:center;padding:40px;color:#555}
`;

const page = (title: string, body: string) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;

const CLIENT_JS = `
(async () => {
  const code = document.getElementById('src').textContent;
  const stage = document.getElementById('stage');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', htmlLabels: false, theme: 'default', flowchart: { useMaxWidth: false } });
  try {
    const { svg } = await mermaid.render('arch', code);
    stage.innerHTML = svg;
  } catch (e) {
    stage.innerHTML = '<div class="err">Mermaid syntax error\\n' + String(e.message || e).replace(/</g, '&lt;') + '</div>';
    return;
  }
  const svgEl = stage.querySelector('svg');

  // zoom / pan
  let on = false, s = 1, tx = 0, ty = 0, drag = null;
  const apply = () => { svgEl.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; };
  const zoomBtn = document.getElementById('zoomBtn');
  zoomBtn.onclick = () => {
    on = !on;
    stage.classList.toggle('zoom', on);
    zoomBtn.textContent = on ? '\\u26F6 Disable zoom' : '\\u26F6 Enable zoom';
    if (!on) { s = 1; tx = 0; ty = 0; apply(); }
  };
  stage.addEventListener('wheel', (e) => {
    if (!on) return;
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; s *= f;
    apply();
  }, { passive: false });
  stage.addEventListener('mousedown', (e) => { if (!on) return; e.preventDefault(); drag = { x: e.clientX - tx, y: e.clientY - ty }; });
  window.addEventListener('mousemove', (e) => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); });
  window.addEventListener('mouseup', () => { drag = null; });

  // export
  const name = decodeURIComponent(location.pathname.slice(1)) || 'architecture';
  const dl = (blob, fn) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click(); URL.revokeObjectURL(a.href); };
  const svgText = () => {
    const c = svgEl.cloneNode(true);
    c.style.transform = '';
    const vb = c.viewBox.baseVal;
    c.setAttribute('width', vb.width); c.setAttribute('height', vb.height);
    return new XMLSerializer().serializeToString(c);
  };
  document.querySelectorAll('[data-x]').forEach((b) => b.onclick = async () => {
    b.closest('details').open = false;
    if (b.dataset.x === 'copy') await navigator.clipboard.writeText(code);
    if (b.dataset.x === 'svg') dl(new Blob([svgText()], { type: 'image/svg+xml' }), name + '.svg');
    if (b.dataset.x === 'png') {
      const vb = svgEl.viewBox.baseVal, k = 2;
      const cv = document.createElement('canvas'); cv.width = vb.width * k; cv.height = vb.height * k;
      const img = new Image();
      img.onload = () => {
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((bl) => dl(bl, name + '.png'), 'image/png');
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText());
    }
  });
})();
`;

const app = new Hono();

app.get('/vendor/mermaid.min.js', (c) =>
  c.body(readFileSync(MERMAID_JS), 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'max-age=86400' }),
);

app.get('/', (c) => {
  const repos = listRepos();
  const list = repos.length
    ? repos.map((r) => `<a class="btn" href="/${encodeURIComponent(r)}">${esc(r)}</a>`).join('')
    : `<p class="empty">architecture.md がありません: <code>${esc(ARCH_DIR)}/&lt;repo&gt;/architecture.md</code></p>`;
  return c.html(page('architecture-diagram', `<header>${list}</header>`));
});

app.get('/:repo', (c) => {
  const repo = c.req.param('repo');
  if (!/^[\w.-]+$/.test(repo)) return c.notFound();
  const file = join(ARCH_DIR, repo, 'architecture.md');
  if (!existsSync(file)) return c.notFound();
  const { front, mermaid, infoHtml } = parseDoc(readFileSync(file, 'utf8'));
  const root = front.root ?? '';
  const repoBtn = root
    ? `<a class="btn" href="vscode://file${esc(root)}" title="${esc(root)}">&#9633; ${esc(repo)}</a>`
    : `<span class="btn">&#9633; ${esc(repo)}</span>`;
  const meta = [root && `root: ${esc(root)}`, front.generated && `generated: ${esc(front.generated)}`].filter(Boolean).join(' / ');
  const body = `
<header>
  ${repoBtn}
  <details><summary class="btn">&#9432; Info &#9662;</summary><div class="menu info">${meta ? `<p class="meta">${meta}</p>` : ''}${infoHtml}</div></details>
  <button class="btn" id="zoomBtn">&#9974; Enable zoom</button>
  <details><summary class="btn">&#10515; Export &#9662;</summary><div class="menu">
    <button data-x="copy">Copy Mermaid code</button>
    <button data-x="svg">Download SVG</button>
    <button data-x="png">Download PNG</button>
  </div></details>
  <button class="btn strong" onclick="location.reload()">&#8635; Reload</button>
</header>
<main><div id="stage"></div></main>
<pre id="src" hidden>${esc(mermaid)}</pre>
<script src="/vendor/mermaid.min.js"></script>
<script>${CLIENT_JS}</script>`;
  return c.html(page(`${repo} — architecture-diagram`, body));
});

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`architecture-diagram: http://127.0.0.1:${PORT}  (ARCH_DIR=${ARCH_DIR})`);
});
