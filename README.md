# Shopify Product–Tag Mindmap (Node + vis-network)

Generate an interactive, searchable **product ↔ tag mindmap** from a Shopify products CSV.  
Products and tags are nodes; edges connect products to their tags. The page includes:

- 🔍 Live search (products or tags) with neighborhood highlighting  
- 🧲 Force layout with **physics freeze** (keeps the nice layout without bouncing)  
- 🎛 Physics toggle + hierarchical layout option  
- 🧭 Fit-to-screen button  
- ⏳ **Loading overlay** that shows **“Loading nodes: X / TOTAL”** while nodes stream in

---

## Preview

The script outputs a single `index.html` you can open locally or host (e.g., GitHub Pages, Netlify).

---

## Requirements

- **Node.js** 16+  
- A Shopify products CSV (standard export) containing at least: `Title`, `Tags`  
  (Optional but recommended: `Handle`)

---

## Quick Start

1) Install dependency:

```bash
npm i csv-parse
```

> Optionally add a build script to your `package.json`:
>
> ```json
> {
>   "scripts": {
>     "build": "node build-graph.mjs \"./products.csv\" index.html"
>   }
> }
> ```

2) Run the script (adjust the CSV path as needed):

```bash
node build-graph.mjs "products.csv" index.html
```

3) Open the generated **`index.html`** in your browser.

---

## CSV Format

Minimum columns:

- **Title** – product title  
- **Tags** – comma-separated list (e.g., `green,organic,loose-leaf`)  
- **Handle** (optional) – used to create stable product IDs

Example:

```csv
Title,Handle,Tags
Sencha Classic,sencha-classic,green,organic,loose-leaf
Assam Bold,assam-bold,black,robust,breakfast
Matcha Premium,matcha-premium,green,ceremonial,finely-ground
```

> If your tags use a different separator (like `;` or `|`), change the splitter in `build-graph.mjs`:
>
> ```js
> .split(/[,;|]/)
> ```

---

## Features

- **Interactive graph** using [vis-network](https://visjs.github.io/vis-network/)
- **Search** for a product or tag to show it **plus its neighbors**
- **Double-click a tag** to focus that tag’s neighborhood
- **Edge highlighting**: select a node to highlight its connected edges
- **Physics**:
  - Starts enabled to compute a nice **force layout**
  - Automatically **freezes** positions after stabilization  
  - Toggle physics back on if you want to “re-shake” the layout
- **Hierarchical layout** option (Left→Right by default)

---

## What the Script Does

- Reads your CSV
- Builds a bipartite graph: **products** ↔ **tags**
- Streams nodes into the page with a **progress bar**
- Adds edges, lets physics stabilize, then **freezes** positions
- Writes a single self-contained **`index.html`**

---

## Customization

Open **`build-graph.mjs`** and adjust:

- **Tag separator** (default comma):
  ```js
  .split(",")
  // or accept commas, semicolons, or pipes:
  .split(/[,;|]/)
  ```

- **Loading speed vs. smoothness**  
  ```js
  const BATCH_SIZE = 400; // bigger = faster, smaller = smoother progress
  ```

- **Physics parameters** (force layout strength, etc.) inside:
  ```js
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: { ... },
    stabilization: { iterations: 300 }
  }
  ```

- **Node shapes & colors**  
  Products are blue dots; tags are orange diamonds. Tweak the `groups` section in the HTML.

---

## Page Controls

- **Search**: filters to a match + its neighbors (clear to reset).
- **Physics**: re-enables simulation or freezes current layout.
- **Layout**: switch between force and hierarchical layouts.
- **Fit to screen**: focuses all visible nodes.

---

## Deploying

- **GitHub Pages**
  - Commit `index.html` (or move it into a `docs/` folder) and enable Pages.
- **Netlify / Vercel**
  - Drag-and-drop the folder or connect the repo (no build step needed).

---

## Troubleshooting

- **“Could not find 'Title' and/or 'Tags' columns”**  
  Ensure your CSV headers match exactly (`Title`, `Tags`). If different, update the column detection in the script.

- **No tags appear**  
  Check your tag separator. If not commas, change `split(",")` to `/[,;|]/`.

- **Nodes keep bouncing**  
  That’s physics running. Use the **Physics** toggle to freeze, or rely on the automatic freeze after stabilization.

- **Tags form a circle when physics is off**  
  This script **freezes** the force layout positions before disabling physics, so you keep the good layout.

---

## Folder Structure

```
.
├── build-graph.mjs      # Node script that generates index.html
├── products.csv         # Your input CSV (any path is fine)
├── index.html           # Output (open in the browser)
└── README.md
```

---

## License

MIT — use freely.

---

## Acknowledgements

- [vis-network](https://visjs.github.io/vis-network/) — interactive network visualization  
- [csv-parse](https://csv.js.org/parse/) — CSV parsing for Node
