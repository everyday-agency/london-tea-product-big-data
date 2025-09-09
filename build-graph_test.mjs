import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

/**
 * Usage:
 *   node build-graph.mjs <input.csv> <output.html>
 *
 * Example:
 *   node build-graph.mjs "London-Tea-export-Products - products_export_1.csv" graph.html
 */

// ----------- CLI ARGS -----------
const [, , INPUT = "products.csv", OUTPUT = "graph.html"] = process.argv;

// ----------- Helpers -----------
const normalize = (s) => (s ?? "").toString().trim();
const splitTags = (tagsCell) =>
  normalize(tagsCell)
    .split(",") // Shopify default separator
    .map((t) => t.trim())
    .filter(Boolean);

const idSafe = (s) =>
  normalize(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_:.]/g, ""); // keep a few safe chars

// ----------- Read CSV -----------
const csvRaw = fs.readFileSync(INPUT, "utf8");
const records = parse(csvRaw, {
  columns: true,
  skip_empty_lines: true,
});

// Shopify usually: Title, Handle, Tags
const titleKey = Object.keys(records[0] || {}).find(
  (k) => k.toLowerCase() === "title"
);
const handleKey = Object.keys(records[0] || {}).find(
  (k) => k.toLowerCase() === "handle"
);
const tagsKey = Object.keys(records[0] || {}).find(
  (k) => k.toLowerCase() === "tags"
);

if (!titleKey || !tagsKey) {
  console.error("❌ Could not find 'Title' and/or 'Tags' columns in CSV headers.");
  process.exit(1);
}

// ----------- Build Graph (nodes + edges) -----------
/**
 * We create:
 * - Product nodes (group: 'product')
 * - Tag nodes (group: 'tag')
 * - Edges Product -> Tag
 */
const nodesMap = new Map(); // id -> node
const edges = [];

// To keep tag IDs unique
const tagId = (t) => `tag:${idSafe(t)}`;

let productCount = 0;
let edgeCount = 0;

for (const row of records) {
  const title = normalize(row[titleKey]);
  if (!title) continue;

  const handle = handleKey ? normalize(row[handleKey]) : "";
  const pId = handle ? `product:${idSafe(handle)}` : `product:${idSafe(title)}`;
  const tags = splitTags(row[tagsKey]);

  // Add product node
  if (!nodesMap.has(pId)) {
    nodesMap.set(pId, {
      id: pId,
      label: title,
      title: `<b>Product</b><br/>${title}${handle ? `<br/><i>${handle}</i>` : ""}`,
      group: "product",
      shape: "dot",
      value: 1, // weight for physics
    });
    productCount++;
  }

  // Add tag nodes + edges
  for (const t of tags) {
    const tid = tagId(t);
    if (!nodesMap.has(tid)) {
      nodesMap.set(tid, {
        id: tid,
        label: t,
        title: `<b>Tag</b><br/>${t}`,
        group: "tag",
        shape: "hexagon", // if not supported in your vis version, switch to "diamond"
        value: 1,
      });
    }
    edges.push({ from: pId, to: tid });
    edgeCount++;
  }
}

// ----------- HTML Template with embedded data -----------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Shopify Product–Tag Graph</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header .stats { margin-left: auto; font-size: 12px; opacity: 0.8; }
  #network { width: 100%; height: calc(100% - 58px); }
  input[type="search"] { padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; min-width: 260px; }
  button, select, label { font-size: 14px; }
  .legend { display:flex; gap:16px; align-items:center; font-size: 13px; }
  .badge { display:inline-flex; align-items:center; gap:6px; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; background:#6baed6; }
  .diamond { width:12px; height:12px; display:inline-block; transform:rotate(45deg); background:#fdae6b; }

  /* Loading overlay */
  #loading {
    position: fixed;
    inset: 0;
    background: rgba(255,255,255,0.96);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    flex-direction: column;
    gap: 10px;
    transition: opacity 200ms ease;
  }
  #loading.hide { opacity: 0; pointer-events: none; }
  .load-title { font-weight: 600; }
  .progress-wrap {
    width: min(560px, 90vw);
    height: 10px;
    background: #eee;
    border-radius: 999px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    width: 0%;
    background: #3b82f6;
    transition: width 60ms linear;
  }
  .progress-text { font-size: 12px; opacity: 0.8; }
</style>
</head>
<body>
<header>
  <strong>Product–Tag Mindmap</strong>

  <input id="search" type="search" placeholder="Search product or tag..." />

  <label><input type="checkbox" id="physics" checked /> Physics</label>

  <select id="layout">
    <option value="force">Force (default)</option>
    <option value="hier">Hierarchical</option>
  </select>

  <button id="fit">Fit to screen</button>

  <div class="legend">
    <span class="badge"><span class="dot"></span>Products</span>
    <span class="badge"><span class="diamond"></span>Tags</span>
  </div>

  <div class="stats">${productCount} products • ${nodesMap.size - productCount} tags • ${edgeCount} edges</div>
</header>
<div id="network"></div>

<!-- Loading overlay -->
<div id="loading">
  <div class="load-title">Building graph…</div>
  <div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
  <div class="progress-text" id="progressText">Loading nodes: 0 / 0</div>
</div>

<!-- vis-network (modern) -->
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<script>
  // ---- Data embedded ----
  const initialNodes = ${JSON.stringify(Array.from(nodesMap.values()))};
  const initialEdges = ${JSON.stringify(edges)};

  // Progressive loading config
  const BATCH_SIZE = 400; // tune for your machine (bigger = faster, smaller = smoother)

  const container = document.getElementById('network');

  // Start with empty datasets and progressively add
  const data = {
    nodes: new vis.DataSet([]),
    edges: new vis.DataSet([]),
  };

  // Same options as your original (physics on by default)
  const commonOptions = {
    interaction: {
      hover: true,
      multiselect: true,
      dragNodes: true,
      navigationButtons: true,
      keyboard: { enabled: true },
    },
    nodes: {
      font: { size: 12 },
      scaling: { min: 10, max: 30 },
    },
    edges: {
      arrows: { to: false },
      smooth: { type: 'dynamic' },
      color: { opacity: 0.4 },
    },
    groups: {
      product: { color: { background: '#6baed6', border: '#3182bd' } },
      tag:     { color: { background: '#fdae6b', border: '#e6550d' } },
    },
    physics: {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 120, springConstant: 0.08, avoidOverlap: 0.1 },
      stabilization: { iterations: 300 },
    },
  };

  // Create the network immediately so controls work, then stream nodes/edges into it
  let network = new vis.Network(container, data, commonOptions);

  // ---- Loading UI ----
  const loadingEl = document.getElementById('loading');
  const barEl = document.getElementById('progressBar');
  const textEl = document.getElementById('progressText');
  const totalNodes = initialNodes.length;
  let loadedNodes = 0;

  const updateProgress = () => {
    const pct = totalNodes === 0 ? 100 : Math.round((loadedNodes / totalNodes) * 100);
    barEl.style.width = pct + '%';
    textEl.textContent = 'Loading nodes: ' + loadedNodes.toLocaleString() + ' / ' + totalNodes.toLocaleString();
  };

  // Add nodes in batches so the UI can update the counter smoothly
  const addNodesInBatches = (startIndex = 0) => {
    const end = Math.min(startIndex + BATCH_SIZE, totalNodes);
    const chunk = initialNodes.slice(startIndex, end);
    if (chunk.length) {
      data.nodes.add(chunk);
      loadedNodes += chunk.length;
      updateProgress();
    }
    if (end < totalNodes) {
      // Yield to browser, then continue
      setTimeout(() => addNodesInBatches(end), 0);
    } else {
      // All nodes added — now add edges in one go
      data.edges.add(initialEdges);
      // Once first frame is drawn, fit + fade out loader
      network.once('afterDrawing', () => {
        setTimeout(() => loadingEl.classList.add('hide'), 150);
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutCubic' }});
      });
    }
  };

  // Kick off progressive load
  updateProgress();
  addNodesInBatches(0);

  // ---- Controls ----
  const search = document.getElementById('search');
  const physicsToggle = document.getElementById('physics');
  const layoutSel = document.getElementById('layout');
  const fitBtn = document.getElementById('fit');

  const highlight = (query) => {
    const q = (query || '').trim().toLowerCase();
    const allIds = data.nodes.getIds();
    if (!q) {
      // Reset all
      data.nodes.update(allIds.map(id => ({ id, hidden: false, opacity: 1 })));
      data.edges.update(data.edges.getIds().map(id => ({ id, hidden: false })));
      return;
    }
    // Find matches
    const matches = data.nodes.get({
      filter: n => (n.label || '').toLowerCase().includes(q),
      fields: ['id'],
    }).map(n => n.id);

    // Expand neighbors of matches
    const keep = new Set(matches);
    matches.forEach(mid => {
      network.getConnectedNodes(mid).forEach(nid => keep.add(nid));
    });

    // Show only matches + neighbors
    data.nodes.update(allIds.map(id => ({ id, hidden: !keep.has(id) })));
    // Hide edges not fully visible
    data.edges.update(data.edges.getIds().map(eid => {
      const e = data.edges.get(eid);
      const show = keep.has(e.from) && keep.has(e.to);
      return { id: eid, hidden: !show };
    }));
  };

  search.addEventListener('input', (e) => {
    highlight(e.target.value);
  });

  physicsToggle.addEventListener('change', (e) => {
    network.setOptions({ physics: { enabled: e.target.checked } });
  });

  layoutSel.addEventListener('change', (e) => {
    if (e.target.value === 'hier') {
      network.setOptions({
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'LR',
            nodeSpacing: 200,
            treeSpacing: 250,
            levelSeparation: 200,
          },
        },
        physics: { enabled: false },
      });
    } else {
      network.setOptions({
        layout: { hierarchical: { enabled: false } },
        physics: { enabled: physicsToggle.checked },
      });
    }
  });

  fitBtn.addEventListener('click', () => {
    network.fit({ animation: { duration: 600, easingFunction: 'easeInOutCubic' }});
  });

  // Double-click a tag to focus its neighborhood
  network.on('doubleClick', (params) => {
    if (!params.nodes?.length) return;
    const id = params.nodes[0];
    const node = data.nodes.get(id);
    if (node?.group === 'tag') {
      const neighbors = network.getConnectedNodes(id);
      const focusIds = [id, ...neighbors];
      network.fit({ nodes: focusIds, animation: { duration: 600 } });
      // Light filter: show only tag + neighbors
      const keep = new Set(focusIds);
      data.nodes.update(data.nodes.getIds().map(nid => ({ id: nid, hidden: !keep.has(nid) })));
      data.edges.update(data.edges.getIds().map(eid => {
        const e = data.edges.get(eid);
        const show = keep.has(e.from) && keep.has(e.to);
        return { id: eid, hidden: !show };
      }));
    }
  });
</script>
</body>
</html>`;

// ----------- Write HTML -----------
fs.writeFileSync(OUTPUT, html, "utf8");

console.log(`✅ Wrote ${OUTPUT}
• Products: ${productCount}
• Tags: ${nodesMap.size - productCount}
• Edges: ${edgeCount}`);
console.log(`Open the HTML file in your browser to explore the mindmap.`);