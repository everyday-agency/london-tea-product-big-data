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
    .split(",")
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
  console.error(
    "❌ Could not find 'Title' and/or 'Tags' columns in CSV headers."
  );
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
        shape: "hexagon", // vis-network supports 'hexagon' with newer versions; if not, use 'diamond'
        value: 1,
      });
    }
    edges.push({
      from: pId,
      to: tid,
    });
    edgeCount++;
  }
}

// Optional: Hide products with no tags? (currently we keep them)
// If you want to drop them, filter nodesMap for products with degree 0.

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

  <div class="stats">${productCount} products • ${nodesMap.size -
  productCount} tags • ${edgeCount} edges</div>
</header>
<div id="network"></div>

<!-- vis-network (modern) -->
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<script>
  // ---- Data embedded ----
  const nodes = ${JSON.stringify(Array.from(nodesMap.values()))};
  const edges = ${JSON.stringify(edges)};

  const container = document.getElementById('network');
  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges.map(e => ({
      ...e,
      color: { color: "#e5e7eb" } // default gray-200
    }))),
  };

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
      color: { color: "#e5e7eb", opacity: 0.7 }, // default gray-200
      highlight: "#ef4444", // Tailwind red-500
      selectionWidth: 3,
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

  let network = new vis.Network(container, data, commonOptions);

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

  // --- Highlight edges on node select ---
  network.on("selectNode", function(params) {
    const selectedId = params.nodes[0];
    const connectedEdgeIds = network.getConnectedEdges(selectedId);
    const allEdgeIds = data.edges.getIds();

    // Set all edges to gray
    data.edges.update(allEdgeIds.map(id => ({
      id,
      color: { color: "#e5e7eb" }
    })));

    // Set connected edges to red
    data.edges.update(connectedEdgeIds.map(id => ({
      id,
      color: { color: "#ef4444" }
    })));
  });

  // Reset edge colors on deselect
  network.on("deselectNode", function() {
    const allEdgeIds = data.edges.getIds();
    data.edges.update(allEdgeIds.map(id => ({
      id,
      color: { color: "#e5e7eb" }
    })));
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
