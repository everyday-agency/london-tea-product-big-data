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
    .split(",") // Shopify default; change to /[,;|]/ if needed
    .map((t) => t.trim())
    .filter(Boolean);

const idSafe = (s) =>
  normalize(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_:.]/g, "");

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
 * Nodes:
 *  - Product (group: 'product')
 *  - Tag     (group: 'tag')
 * Edges:
 *  - Product -> Tag
 */
const nodesMap = new Map(); // id -> node
const edges = [];

const tagId = (t) => `tag:${idSafe(t)}`;

let productCount = 0;
let edgeCount = 0;

for (const row of records) {
  const title = normalize(row[titleKey]);
  if (!title) continue;

  const handle = handleKey ? normalize(row[handleKey]) : "";
  const pId = handle ? `product:${idSafe(handle)}` : `product:${idSafe(title)}`;
  const tags = splitTags(row[tagsKey]);

  if (!nodesMap.has(pId)) {
    nodesMap.set(pId, {
      id: pId,
      label: title,
      title: `<b>Product</b><br/>${title}${handle ? `<br/><i>${handle}</i>` : ""}`,
      group: "product",
      shape: "dot",
      value: 1,
    });
    productCount++;
  }

  for (const t of tags) {
    const tid = tagId(t);
    if (!nodesMap.has(tid)) {
      nodesMap.set(tid, {
        id: tid,
        label: t,
        title: `<b>Tag</b><br/>${t}`,
        group: "tag",
        shape: "diamond", // change back to "hexagon" if your vis version supports it
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
    position: fixed; inset: 0;
    background: rgba(255,255,255,0.96);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; flex-direction: column; gap: 10px;
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
    height: 100%; width: 0%;
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
    <option value="force" selected>Force (default)</option>
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

<!-- vis-network -->
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<script>
  // ---- Data embedded ----
  const initialNodes = ${JSON.stringify(Array.from(nodesMap.values()))};
  const initialEdges = ${JSON.stringify(edges)};

  // Progressive loading config
  const BATCH_SIZE = 400; // tune: bigger=faster, smaller=smoother

  const container = document.getElementById('network');

  // Start with empty datasets and progressively add
  const data = {
    nodes: new vis.DataSet([]),
    edges: new vis.DataSet([]),
  };

  // Helper: freeze current layout (keep physics look but stop moving)
  function freezeLayout(network, data) {
    network.stopSimulation();
    const ids = data.nodes.getIds();
    const pos = network.getPositions(ids); // { id: {x, y} }
    const updates = ids.map(id => ({ id, x: pos[id].x, y: pos[id].y }));
    data.nodes.update(updates);
    network.setOptions({ physics: { enabled: false } });
  }

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
      color: { color: "#e5e7eb", opacity: 0.7 },
      selectionWidth: 3,
    },
    groups: {
      product: { color: { background: '#6baed6', border: '#3182bd' } },
      tag:     { color: { background: '#fdae6b', border: '#e6550d' } },
    },
    physics: {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -50,
        centralGravity: 0.01,
        springLength: 120,
        springConstant: 0.08,
        avoidOverlap: 0.1
      },
      stabilization: { iterations: 300 }
    },
    layout: { hierarchical: { enabled: false } }
  };

  let network = null;

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
      setTimeout(() => addNodesInBatches(end), 0);
    } else {
      // All nodes added — now create the network, add edges, stabilize, freeze, fit, hide loader
      network = new vis.Network(container, data, commonOptions);
      data.edges.add(initialEdges.map(e => ({ ...e, color: { color: "#e5e7eb" } })));

      // After the force layout stabilizes, freeze it and hide loader
      network.once('stabilizationIterationsDone', () => {
        freezeLayout(network, data);
        // Fit, then fade out loader on the next frame for smoother UX
        network.once('afterDrawing', () => {
          setTimeout(() => loadingEl.classList.add('hide'), 150);
          fitVisible();
        });
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

  const fitVisible = () => {
    if (!network) return;
    const visibleIds = data.nodes.get({ filter: n => !n.hidden, fields: ['id'] }).map(n => n.id);
    if (visibleIds.length) {
      network.fit({ nodes: visibleIds, animation: { duration: 600, easingFunction: 'easeInOutCubic' }});
    }
  };

  const highlight = (query) => {
    if (!network) return;
    const q = (query || '').trim().toLowerCase();
    const allIds = data.nodes.getIds();
    if (!q) {
      data.nodes.update(allIds.map(id => ({ id, hidden: false, opacity: 1 })));
      data.edges.update(data.edges.getIds().map(id => ({ id, hidden: false })));
      fitVisible();
      return;
    }
    const matches = data.nodes.get({
      filter: n => (n.label || '').toLowerCase().includes(q),
      fields: ['id'],
    }).map(n => n.id);

    const keep = new Set(matches);
    matches.forEach(mid => {
      network.getConnectedNodes(mid).forEach(nid => keep.add(nid));
    });

    data.nodes.update(allIds.map(id => ({ id, hidden: !keep.has(id) })));
    data.edges.update(data.edges.getIds().map(eid => {
      const e = data.edges.get(eid);
      const show = keep.has(e.from) && keep.has(e.to);
      return { id: eid, hidden: !show };
    }));
    fitVisible();
  };

  search.addEventListener('input', (e) => {
    highlight(e.target.value);
  });

  // Physics toggle: re-enable to recompute; disable to freeze current positions
  physicsToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    if (!network) return;
    if (enabled) {
      network.setOptions({ physics: { enabled: true } });
    } else {
      freezeLayout(network, data);
    }
  });

  layoutSel.addEventListener('change', (e) => {
    if (!network) return;
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
        physics: { enabled: physicsToggle.checked }
      });
      if (!physicsToggle.checked) {
        freezeLayout(network, data);
      }
    }
    fitVisible();
  });

  fitBtn.addEventListener('click', fitVisible);

  // --- Highlight edges on node select ---
  if (!network) {
    // Just in case, bind after network creation as soon as it's ready
    const _bind = () => {
      if (!network) return requestAnimationFrame(_bind);
      network.on("selectNode", function(params) {
        const selectedId = params.nodes[0];
        const connectedEdgeIds = network.getConnectedEdges(selectedId);
        const allEdgeIds = data.edges.getIds();
        data.edges.update(allEdgeIds.map(id => ({ id, color: { color: "#e5e7eb" } })));
        data.edges.update(connectedEdgeIds.map(id => ({ id, color: { color: "#ef4444" } })));
      });
      network.on("deselectNode", function() {
        const allEdgeIds = data.edges.getIds();
        data.edges.update(allEdgeIds.map(id => ({ id, color: { color: "#e5e7eb" } })));
      });
    };
    _bind();
  }
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