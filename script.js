const STORAGE_KEY = "open-map-library-v2";
const LEGACY_STORAGE_KEY = "open-map-v1";
const THEME_KEY = "open-map-theme";
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const DEFAULT_WIDTH = 154;
const DEFAULT_HEIGHT = 82;
const MIN_WIDTH = 100;
const MIN_HEIGHT = 60;
const SPACING = 20;
const CLIPBOARD_TYPE = "application/x-open-map-bubbles";
const COLORS = [
  { name: "Red", swatch: "#e5484d", fill: "#ffd7d9", darkFill: "#67313b" },
  { name: "Orange", swatch: "#ef8b2c", fill: "#ffe2c4", darkFill: "#684426" },
  { name: "Yellow", swatch: "#e3bd16", fill: "#fff1a8", darkFill: "#5b5125" },
  { name: "Green", swatch: "#35a76a", fill: "#c9f2d9", darkFill: "#285b46" },
  { name: "Blue", swatch: "#3d87df", fill: "#cfe5ff", darkFill: "#2c4e73" },
  { name: "Indigo", swatch: "#5958c8", fill: "#dcdcff", darkFill: "#404274" },
  { name: "Violet", swatch: "#a65acb", fill: "#efd6fa", darkFill: "#593968" },
];

const workspace = document.querySelector("#workspace");
const canvas = document.querySelector("#canvas");
const selectionBox = document.querySelector("#selection-box");
const degreesValue = document.querySelector("#degrees-value");
const degreesUp = document.querySelector("#degrees-up");
const degreesDown = document.querySelector("#degrees-down");
const nodesLayer = document.querySelector("#nodes");
const connectionsLayer = document.querySelector("#connections");
const crossingConnectionsLayer = document.querySelector("#crossing-connections");
const paletteLayer = document.querySelector("#palette-colors");
const mapList = document.querySelector("#map-list");
const searchInput = document.querySelector("#search-nodes");
const searchCount = document.querySelector("#search-count");
const newMapButton = document.querySelector("#new-map");
const duplicateMapButton = document.querySelector("#duplicate-map");
const renameMapButton = document.querySelector("#rename-map");
const deleteMapButton = document.querySelector("#delete-map");
const saveFileButton = document.querySelector("#save-file");
const openFileButton = document.querySelector("#open-file");
const fileInput = document.querySelector("#file-input");
const deleteLinkButton = document.querySelector("#delete-link");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
const fitAllButton = document.querySelector("#fit-all");
const themeButton = document.querySelector("#theme-toggle");
const themeColorMeta = document.querySelector("#theme-color");
const moveToolButton = document.querySelector("#move-tool");
const clearColorsButton = document.querySelector("#clear-colors");
const clearAllColorsButton = document.querySelector("#clear-all-colors");
const hint = document.querySelector("#hint");
const zoomLabel = document.querySelector("#zoom-label");

function blankMap(name = "My ideas") {
  return {
    id: crypto.randomUUID(), name,
    nodes: [{ id: crypto.randomUUID(), x: 1123, y: 759, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, text: "My ideas", groups: [] }],
    edges: [],
  };
}

function starterMap() {
  const first = blankMap();
  const centerId = first.nodes[0].id;
  for (let index = 0; index < 5; index++) {
    const angle = (-90 + index * 72) * Math.PI / 180;
    const id = crypto.randomUUID();
    first.nodes.push({
      id,
      x: Math.round(1200 + Math.cos(angle) * 280 - DEFAULT_WIDTH / 2),
      y: Math.round(800 + Math.sin(angle) * 230 - DEFAULT_HEIGHT / 2),
      width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
      text: `Idea ${index + 1}`, groups: [],
    });
    first.edges.push({ id: crypto.randomUUID(), from: centerId, to: id });
  }
  return first;
}

function normalizeMap(raw, fallbackName = "Imported map") {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error("This file is not an Open Map map.");
  const nodes = raw.nodes.filter(node => node && typeof node.id === "string").map(node => ({
    id: node.id,
    x: Number.isFinite(node.x) ? node.x : 1000,
    y: Number.isFinite(node.y) ? node.y : 700,
    width: Number.isFinite(node.width) ? Math.max(node.width, MIN_WIDTH) : DEFAULT_WIDTH,
    height: Number.isFinite(node.height) ? Math.max(node.height, MIN_HEIGHT) : DEFAULT_HEIGHT,
    text: typeof node.text === "string" ? node.text.slice(0, 100) : "Untitled",
    groups: Array.isArray(node.groups) ? [...new Set(node.groups.filter(name => COLORS.some(color => color.name === name)))] : [],
  }));
  const ids = new Set(nodes.map(node => node.id));
  const edges = raw.edges.filter(edge => edge && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
    .map(edge => ({ id: typeof edge.id === "string" ? edge.id : crypto.randomUUID(), from: edge.from, to: edge.to }));
  return { id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(), name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : fallbackName, nodes, edges };
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.maps) && saved.maps.length) {
      const maps = saved.maps.map(item => normalizeMap(item, "Untitled map"));
      return { activeMapId: maps.some(item => item.id === saved.activeMapId) ? saved.activeMapId : maps[0].id, maps };
    }
  } catch { /* Start fresh when saved data is unavailable. */ }
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) {
      const oldMap = normalizeMap(legacy, "My first map");
      return { activeMapId: oldMap.id, maps: [oldMap] };
    }
  } catch { /* Start fresh when saved data is unavailable. */ }
  const first = starterMap();
  return { activeMapId: first.id, maps: [first] };
}

let library = loadLibrary();
let map = library.maps.find(item => item.id === library.activeMapId);
let history = [JSON.stringify(map)];
let historyIndex = 0;
const histories = new Map();
const views = new Map();
let selectedIds = new Set();
let degreeAnchorId = null;
let degreeDepth = 0;
let selectedEdgeId = null;
let paintColor = null;
let editingId = null;
let drag = null;
let resize = null;
let connectionDrag = null;
let panDrag = null;
let marquee = null;
let zoom = 1;
let panX = 0;
let panY = 0;
let theme = "light";
let lastPointer = null;
let copiedBubbles = null;
try { if (localStorage.getItem(THEME_KEY) === "dark") theme = "dark"; }
catch { /* Use the default theme when storage is unavailable. */ }

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "☀" : "☾";
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
  themeColorMeta.setAttribute("content", theme === "dark" ? "#171a20" : "#f7f6f2");
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme();
  for (const element of nodesLayer.children) element.style.background = nodeBackground(getNode(element.dataset.id));
  try { localStorage.setItem(THEME_KEY, theme); }
  catch { /* The theme still works for this session. */ }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); }
  catch { hint.textContent = "Browser storage is unavailable; this map will reset when you close the page."; }
}

function commit() {
  const snapshot = JSON.stringify(map);
  if (snapshot === history[historyIndex]) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 100) history.shift();
  historyIndex = history.length - 1;
  save();
  updateControls();
}

function travelHistory(direction) {
  if (drag || resize || connectionDrag || marquee || editingId) return;
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  map = JSON.parse(history[historyIndex]);
  library.maps[library.maps.findIndex(item => item.id === map.id)] = map;
  selectedIds = new Set([...selectedIds].filter(id => map.nodes.some(node => node.id === id)));
  if (!map.edges.some(edge => edge.id === selectedEdgeId)) selectedEdgeId = null;
  render();
  renderMapList();
  save();
}

function getNode(id) { return map.nodes.find(node => node.id === id); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function centerOf(node) { return { x: node.x + node.width / 2, y: node.y + node.height / 2 }; }

function applyNodeTypography(element) {
  const reducedZoom = Math.min(zoom, 1);
  // The font gains size in map coordinates as the map shrinks, while its
  // on-screen size still changes gently with zoom.
  const fontScale = Math.min(36 / 15, reducedZoom ** -0.65);
  element.style.fontSize = `${(15 * fontScale).toFixed(2)}px`;
  element.style.padding = `${(15 * reducedZoom).toFixed(2)}px ${(20 * reducedZoom).toFixed(2)}px`;
  element.style.lineHeight = (1.05 + 0.2 * reducedZoom).toFixed(2);
  const squareSize = Math.max(13 * fontScale, 10 / zoom);
  const hitSize = Math.max(24 * fontScale, 24 / zoom);
  element.style.setProperty("--resize-square-size", `${squareSize.toFixed(2)}px`);
  element.style.setProperty("--resize-hit-size", `${hitSize.toFixed(2)}px`);
  element.style.setProperty("--resize-hit-offset", `${(-hitSize / 2).toFixed(2)}px`);
  element.style.setProperty("--resize-border-width", `${Math.max(2, 1.5 / zoom).toFixed(2)}px`);
}

function updateView(updateTypography = true) {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  workspace.style.backgroundSize = `${22 * zoom}px ${22 * zoom}px`;
  workspace.style.backgroundPosition = `${panX}px ${panY}px`;
  if (updateTypography) for (const element of nodesLayer.children) applyNodeTypography(element);
  zoomLabel.textContent = zoom < 0.01 ? "<1%" : `${Math.round(zoom * 100)}%`;
}

function setZoom(next) { zoom = clamp(next, 0.000001, 3); updateView(); }

function centerMap() {
  const target = map.nodes[0] ? centerOf(map.nodes[0]) : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  panX = workspace.clientWidth / 2 - target.x * zoom;
  panY = workspace.clientHeight / 2 - target.y * zoom;
  updateView();
}

function canvasPoint(event) {
  const rect = workspace.getBoundingClientRect();
  return { x: (event.clientX - rect.left - panX) / zoom, y: (event.clientY - rect.top - panY) / zoom };
}

function screenPoint(event) {
  const rect = workspace.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function fitAll() {
  if (!map.nodes.length) { setZoom(1); centerMap(); return; }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of map.nodes) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  const padding = 64;
  const width = Math.max(1, workspace.clientWidth - padding * 2);
  const height = Math.max(1, workspace.clientHeight - padding * 2);
  setZoom(Math.min(1, width / (right - left), height / (bottom - top)));
  panX = workspace.clientWidth / 2 - (left + right) / 2 * zoom;
  panY = workspace.clientHeight / 2 - (top + bottom) / 2 * zoom;
  updateView();
}

function ellipseEndpoint(from, to) {
  const a = centerOf(from);
  const b = centerOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return a;
  const scale = 1 / Math.sqrt((dx / (from.width / 2)) ** 2 + (dy / (from.height / 2)) ** 2);
  return { x: a.x + dx * scale, y: a.y + dy * scale };
}

function edgePoint(node, point) {
  const c = centerOf(node);
  const dx = point.x - c.x;
  const dy = point.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x + node.width / 2, y: c.y };
  const scale = 1 / Math.sqrt((dx / (node.width / 2)) ** 2 + (dy / (node.height / 2)) ** 2);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

// The outer 14 pixels of the ellipse act as the connection drag region.
function isNearEdge(node, point) {
  const c = centerOf(node);
  const rx = node.width / 2;
  const ry = node.height / 2;
  const radial = Math.sqrt(((point.x - c.x) / rx) ** 2 + ((point.y - c.y) / ry) ** 2);
  return Math.abs(1 - radial) * Math.min(rx, ry) <= 14;
}

function nodeBackground(node) {
  const fills = node.groups.map(name => {
    const color = COLORS.find(item => item.name === name);
    return theme === "dark" ? color?.darkFill : color?.fill;
  }).filter(Boolean);
  if (!fills.length) return "var(--node-bg)";
  if (fills.length === 1) return fills[0];
  const step = 100 / fills.length;
  const stops = fills.flatMap((color, index) => [`${color} ${(index * step).toFixed(2)}%`, `${color} ${((index + 1) * step).toFixed(2)}%`]);
  return `linear-gradient(120deg, ${stops.join(", ")})`;
}

function lineCrossesNode(start, end, node) {
  const center = centerOf(node);
  const rx = node.width / 2;
  const ry = node.height / 2;
  const x = (start.x - center.x) / rx;
  const y = (start.y - center.y) / ry;
  const dx = (end.x - start.x) / rx;
  const dy = (end.y - start.y) / ry;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(-(x * dx + y * dy) / lengthSquared, 0, 1) : 0;
  return (x + t * dx) ** 2 + (y + t * dy) ** 2 < 1;
}

function renderEdges() {
  connectionsLayer.replaceChildren();
  crossingConnectionsLayer.replaceChildren();
  for (const edge of map.edges) {
    const a = getNode(edge.from);
    const b = getNode(edge.to);
    if (!a || !b) continue;
    const start = ellipseEndpoint(a, b);
    const end = ellipseEndpoint(b, a);
    const crossing = map.nodes.some(node => node.id !== edge.from && node.id !== edge.to && lineCrossesNode(start, end, node));
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("connection");
    group.classList.toggle("crossing", crossing);
    group.classList.toggle("selected", edge.id === selectedEdgeId);
    group.dataset.id = edge.id;
    for (const className of ["connection-line", "connection-hit"]) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add(className);
      line.setAttribute("x1", start.x);
      line.setAttribute("y1", start.y);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
      group.append(line);
    }
    group.addEventListener("pointerdown", event => { event.stopPropagation(); selectedIds.clear(); selectedEdgeId = edge.id; updateControls(); });
    (crossing ? crossingConnectionsLayer : connectionsLayer).append(group);
  }
}

function renderMapList() {
  mapList.replaceChildren();
  for (const item of library.maps) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === library.activeMapId ? "active" : "";
    button.textContent = item.name;
    button.title = item.name;
    button.addEventListener("click", () => switchMap(item.id));
    button.addEventListener("dblclick", () => { switchMap(item.id); renameMap(); });
    mapList.append(button);
  }
}

function connectedWithinDegrees(startId, depth) {
  const neighbors = new Map(map.nodes.map(node => [node.id, []]));
  for (const edge of map.edges) {
    if (!neighbors.has(edge.from) || !neighbors.has(edge.to)) continue;
    neighbors.get(edge.from).push(edge.to);
    neighbors.get(edge.to).push(edge.from);
  }
  const visited = new Set([startId]);
  let frontier = [startId];
  for (let step = 0; step < depth && frontier.length; step++) {
    const next = [];
    for (const id of frontier) for (const neighbor of neighbors.get(id) || []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return visited;
}

function updateControls() {
  const singleId = selectedIds.size === 1 && !selectedEdgeId && !paintColor ? [...selectedIds][0] : null;
  if (singleId !== degreeAnchorId) {
    degreeAnchorId = singleId;
    degreeDepth = 0;
  }
  degreesValue.textContent = String(degreeDepth);
  degreesUp.disabled = !singleId || degreeDepth >= 10;
  degreesDown.disabled = !singleId || degreeDepth <= 0;
  const highlighted = singleId ? connectedWithinDegrees(singleId, degreeDepth) : new Set();
  for (const element of nodesLayer.children) {
    element.classList.toggle("selected", selectedIds.has(element.dataset.id));
    element.classList.toggle("degree-highlight", highlighted.has(element.dataset.id));
  }
  for (const element of [...connectionsLayer.children, ...crossingConnectionsLayer.children]) {
    if (element.classList.contains("connection")) element.classList.toggle("selected", element.dataset.id === selectedEdgeId);
  }
  deleteLinkButton.hidden = !selectedEdgeId;
  undoButton.disabled = historyIndex === 0;
  redoButton.disabled = historyIndex === history.length - 1;
  moveToolButton.setAttribute("aria-pressed", String(paintColor === null));
  clearColorsButton.setAttribute("aria-pressed", String(paintColor === "clear"));
  for (const button of paletteLayer.children) button.setAttribute("aria-pressed", String(button.dataset.color === paintColor));
  hint.textContent = marquee ? "Drag a box around ovals to select them."
    : selectedEdgeId ? "Connection selected. Press Delete or use Delete link."
    : connectionDrag ? "Release over another oval to connect."
    : resize ? `Drag the square to resize ${resize.nodes.length > 1 ? "the selected ovals" : "this oval"}.`
    : selectedIds.size > 1 ? `${selectedIds.size} ovals selected. Drag one to move them together, or a corner to resize them.`
    : paintColor === "clear" ? "Click an oval to remove all its colors. Drag to move it."
    : paintColor ? `Click ovals to toggle ${paintColor.toLowerCase()}. Drag to move them.`
    : "Drag to pan · Shift-drag to select ovals · Scroll to zoom";
}

function updateSearch() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  let matches = 0;
  for (const element of nodesLayer.children) {
    const node = getNode(element.dataset.id);
    const matched = !!query && node.text.toLocaleLowerCase().includes(query);
    element.classList.toggle("search-match", matched);
    element.classList.toggle("search-dim", !!query && !matched);
    if (matched) matches++;
  }
  searchCount.textContent = query ? `${matches} of ${map.nodes.length} bubbles match` : "";
}

function renderNodes() {
  nodesLayer.replaceChildren();
  for (const node of map.nodes) {
    const element = document.createElement("div");
    element.className = "node";
    element.classList.toggle("colored", node.groups.length > 0);
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.width = `${node.width}px`;
    element.style.height = `${node.height}px`;
    element.style.background = nodeBackground(node);
    applyNodeTypography(element);
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `${node.text || "Untitled oval"}${node.groups.length ? `, ${node.groups.join(", ")}` : ""}`);

    const label = document.createElement("span");
    label.className = "node-label";
    label.textContent = node.text || "Untitled";
    element.append(label);

    for (const corner of ["nw", "ne", "sw", "se"]) {
      const grip = document.createElement("button");
      grip.className = `resize-handle ${corner}`;
      grip.type = "button";
      grip.tabIndex = -1;
      grip.setAttribute("aria-label", `Resize ${node.text || "oval"} from ${corner} corner`);
      grip.addEventListener("pointerdown", event => startResize(event, node.id, corner));
      element.append(grip);
    }

    element.addEventListener("pointerdown", onNodePointerDown);
    element.addEventListener("pointermove", onNodeHover);
    element.addEventListener("pointerleave", () => element.classList.remove("edge-ready"));
    element.addEventListener("dblclick", event => { event.stopPropagation(); startEditing(node.id); });
    element.addEventListener("keydown", event => {
      if (event.target !== element) return;
      if (event.key === "Enter") { event.preventDefault(); startEditing(node.id); }
      if (event.key === " ") { event.preventDefault(); selectNode(node.id); }
    });
    nodesLayer.append(element);
  }
  updateControls();
  updateSearch();
}

function render() { renderNodes(); renderEdges(); }
function selectNode(id) { selectedIds = new Set([id]); selectedEdgeId = null; updateControls(); }

function addEdge(from, to) {
  if (!from || !to || from === to || map.edges.some(edge =>
    (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) return;
  map.edges.push({ id: crypto.randomUUID(), from, to });
  renderEdges();
  commit();
}

function setPaintTool(color) {
  paintColor = color;
  updateControls();
}

function paintNode(id) {
  const node = getNode(id);
  if (!node || !paintColor) return;
  if (paintColor === "clear") node.groups = [];
  else if (node.groups.includes(paintColor)) node.groups = node.groups.filter(name => name !== paintColor);
  else node.groups = [...node.groups, paintColor];
  const element = nodesLayer.querySelector(`[data-id="${id}"]`);
  if (element) {
    element.style.background = nodeBackground(node);
    element.classList.toggle("colored", node.groups.length > 0);
    element.setAttribute("aria-label", `${node.text}${node.groups.length ? `, ${node.groups.join(", ")}` : ""}`);
  }
  commit();
}

// Keep dragged or resized ovals in place; move neighbors that overlap their boxes.
function spreadNeighbors(anchorIds) {
  const ids = Array.isArray(anchorIds) ? anchorIds : [anchorIds];
  const anchors = new Set(ids);
  const queue = ids.map(getNode).filter(Boolean);
  let steps = 0;
  while (queue.length && steps++ < 80) {
    const moving = queue.shift();
    for (const other of map.nodes) {
      if (other.id === moving.id || anchors.has(other.id)) continue;
      const a = centerOf(moving);
      const b = centerOf(other);
      const overlapX = (moving.width + other.width) / 2 + SPACING - Math.abs(b.x - a.x);
      const overlapY = (moving.height + other.height) / 2 + SPACING - Math.abs(b.y - a.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const beforeX = other.x;
      const beforeY = other.y;
      if (overlapX < overlapY) other.x += (b.x >= a.x ? 1 : -1) * overlapX;
      else other.y += (b.y >= a.y ? 1 : -1) * overlapY;
      if (other.x === beforeX && other.y === beforeY) continue;
      const element = nodesLayer.querySelector(`[data-id="${other.id}"]`);
      if (element) { element.style.left = `${other.x}px`; element.style.top = `${other.y}px`; }
      queue.push(other);
    }
  }
}

function onNodeHover(event) {
  if (drag || resize || connectionDrag || marquee || editingId || event.target.closest(".resize-handle")) return;
  const node = getNode(event.currentTarget.dataset.id);
  event.currentTarget.classList.toggle("edge-ready", isNearEdge(node, canvasPoint(event)));
}

function onNodePointerDown(event) {
  if (event.button !== 0 || editingId || event.target.tagName === "INPUT" || event.target.closest(".resize-handle")) return;
  const element = event.currentTarget;
  const node = getNode(element.dataset.id);
  const point = canvasPoint(event);
  if (!selectedIds.has(node.id)) selectNode(node.id);
  const positions = [...selectedIds].map(id => { const item = getNode(id); return { id, x: item.x, y: item.y }; });
  drag = { id: node.id, pointerId: event.pointerId, startX: point.x, startY: point.y, positions, moved: false, edgeCandidate: isNearEdge(node, point) };
  element.setPointerCapture(event.pointerId);
  element.addEventListener("pointermove", onNodePointerMove);
  element.addEventListener("pointerup", onNodePointerUp);
  element.addEventListener("pointercancel", onNodePointerUp);
}

function onNodePointerMove(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = canvasPoint(event);
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (drag.edgeCandidate) {
    const { id, startX, startY } = drag;
    const element = event.currentTarget;
    element.removeEventListener("pointermove", onNodePointerMove);
    element.removeEventListener("pointerup", onNodePointerUp);
    element.removeEventListener("pointercancel", onNodePointerUp);
    drag = null;
    startConnectionDrag(event, id, { x: startX, y: startY }, element);
    moveConnectionDrag(event);
    return;
  }
  drag.moved = true;
  for (const position of drag.positions) {
    const node = getNode(position.id);
    node.x = position.x + dx;
    node.y = position.y + dy;
    const item = nodesLayer.querySelector(`[data-id="${node.id}"]`);
    if (item) { item.style.left = `${node.x}px`; item.style.top = `${node.y}px`; }
  }
  const element = event.currentTarget;
  element.classList.add("dragging");
  spreadNeighbors(drag.positions.map(position => position.id));
  renderEdges();
}

function onNodePointerUp(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const element = event.currentTarget;
  element.removeEventListener("pointermove", onNodePointerMove);
  element.removeEventListener("pointerup", onNodePointerUp);
  element.removeEventListener("pointercancel", onNodePointerUp);
  element.classList.remove("dragging");
  const { id, moved } = drag;
  drag = null;
  if (moved) commit();
  else if (event.type === "pointercancel") return;
  else { selectNode(id); paintNode(id); }
}

function targetAt(event, fromId) {
  const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest(".node");
  return hovered?.dataset.id && hovered.dataset.id !== fromId ? hovered.dataset.id : null;
}

function startConnectionDrag(event, fromId, point, element) {
  event.preventDefault();
  selectNode(fromId);
  const start = edgePoint(getNode(fromId), point);
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
  preview.classList.add("preview");
  preview.setAttribute("x1", start.x);
  preview.setAttribute("y1", start.y);
  preview.setAttribute("x2", start.x);
  preview.setAttribute("y2", start.y);
  connectionsLayer.append(preview);
  connectionDrag = { fromId, pointerId: event.pointerId, preview, target: null };
  element.setPointerCapture(event.pointerId);
  element.addEventListener("pointermove", moveConnectionDrag);
  element.addEventListener("pointerup", endConnectionDrag);
  element.addEventListener("pointercancel", endConnectionDrag);
  updateControls();
}

function moveConnectionDrag(event) {
  if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) return;
  const point = canvasPoint(event);
  connectionDrag.preview.setAttribute("x2", point.x);
  connectionDrag.preview.setAttribute("y2", point.y);
  const targetId = targetAt(event, connectionDrag.fromId);
  if (connectionDrag.target !== targetId) {
    if (connectionDrag.target) nodesLayer.querySelector(`[data-id="${connectionDrag.target}"]`)?.classList.remove("connection-target");
    connectionDrag.target = targetId;
    if (targetId) nodesLayer.querySelector(`[data-id="${targetId}"]`)?.classList.add("connection-target");
  }
}

function endConnectionDrag(event) {
  if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) return;
  const element = event.currentTarget;
  element.removeEventListener("pointermove", moveConnectionDrag);
  element.removeEventListener("pointerup", endConnectionDrag);
  element.removeEventListener("pointercancel", endConnectionDrag);
  const { fromId, preview, target } = connectionDrag;
  if (target) nodesLayer.querySelector(`[data-id="${target}"]`)?.classList.remove("connection-target");
  preview.remove();
  connectionDrag = null;
  if (event.type === "pointerup") addEdge(fromId, targetAt(event, fromId));
  updateControls();
}

function startResize(event, id, corner) {
  if (event.button !== 0 || editingId) return;
  event.preventDefault();
  event.stopPropagation();
  if (!selectedIds.has(id)) selectNode(id);
  const point = canvasPoint(event);
  resize = {
    corner, pointerId: event.pointerId, startX: point.x, startY: point.y,
    nodes: [...selectedIds].map(nodeId => {
      const node = getNode(nodeId);
      return { id: nodeId, left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height };
    }),
  };
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  handle.addEventListener("pointermove", moveResize);
  handle.addEventListener("pointerup", endResize);
  handle.addEventListener("pointercancel", endResize);
  updateControls();
}

function moveResize(event) {
  if (!resize || event.pointerId !== resize.pointerId) return;
  const point = canvasPoint(event);
  const dx = point.x - resize.startX;
  const dy = point.y - resize.startY;
  for (const original of resize.nodes) {
    const node = getNode(original.id);
    let { left, right, top, bottom } = original;
    if (resize.corner.includes("w")) left = Math.min(left + dx, right - MIN_WIDTH);
    else right = Math.max(right + dx, left + MIN_WIDTH);
    if (resize.corner.includes("n")) top = Math.min(top + dy, bottom - MIN_HEIGHT);
    else bottom = Math.max(bottom + dy, top + MIN_HEIGHT);
    node.x = left;
    node.y = top;
    node.width = right - left;
    node.height = bottom - top;
    const element = nodesLayer.querySelector(`[data-id="${node.id}"]`);
    if (element) {
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      element.style.width = `${node.width}px`;
      element.style.height = `${node.height}px`;
    }
  }
  spreadNeighbors(resize.nodes.map(node => node.id));
  renderEdges();
}

function endResize(event) {
  if (!resize || event.pointerId !== resize.pointerId) return;
  const handle = event.currentTarget;
  handle.removeEventListener("pointermove", moveResize);
  handle.removeEventListener("pointerup", endResize);
  handle.removeEventListener("pointercancel", endResize);
  resize = null;
  commit();
  updateControls();
}

function startEditing(id) {
  const node = getNode(id);
  const element = nodesLayer.querySelector(`[data-id="${id}"]`);
  if (!node || !element) return;
  editingId = id;
  selectNode(id);
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 100;
  input.value = node.text;
  input.setAttribute("aria-label", "Oval text");
  element.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false;
  function finish(shouldCommit) {
    if (finished) return;
    finished = true;
    if (shouldCommit) node.text = input.value.trim() || "Untitled";
    editingId = null;
    renderNodes();
    if (shouldCommit) commit();
  }
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

function addNode(x, y) {
  const node = {
    id: crypto.randomUUID(),
    x: Math.round(x - DEFAULT_WIDTH / 2),
    y: Math.round(y - DEFAULT_HEIGHT / 2),
    width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, text: "New idea", groups: [],
  };
  map.nodes.push(node);
  render();
  spreadNeighbors(node.id);
  renderEdges();
  commit();
  startEditing(node.id);
}

for (const color of COLORS) {
  const button = document.createElement("button");
  button.className = "color-option";
  button.type = "button";
  button.dataset.color = color.name;
  button.innerHTML = `<span class="swatch" style="--swatch:${color.swatch}"></span><span>${color.name}</span>`;
  button.addEventListener("click", () => setPaintTool(color.name));
  paletteLayer.append(button);
}

function switchMap(id) {
  if (id === library.activeMapId || drag || resize || connectionDrag || panDrag || marquee) return;
  if (editingId) document.activeElement?.blur();
  histories.set(map.id, { entries: history, index: historyIndex });
  views.set(map.id, { zoom, panX, panY });
  library.activeMapId = id;
  map = library.maps.find(item => item.id === id);
  const previous = histories.get(id);
  history = previous?.entries || [JSON.stringify(map)];
  historyIndex = previous?.index ?? 0;
  selectedIds.clear();
  selectedEdgeId = null;
  render();
  renderMapList();
  save();
  requestAnimationFrame(() => {
    const view = views.get(id);
    setZoom(view?.zoom ?? 1);
    if (view) { panX = view.panX; panY = view.panY; updateView(); }
    else centerMap();
  });
}

function renameMap() {
  const name = window.prompt("Map name", map.name);
  if (!name?.trim()) return;
  map.name = name.trim().slice(0, 80);
  renderMapList();
  commit();
}

function duplicateMap() {
  if (drag || resize || connectionDrag || panDrag || marquee) return;
  if (editingId) document.activeElement?.blur();
  const original = JSON.parse(JSON.stringify(map));
  const nodeIds = new Map(original.nodes.map(node => [node.id, crypto.randomUUID()]));
  const baseName = `${original.name.slice(0, 75)} copy`;
  let name = baseName;
  let number = 2;
  while (library.maps.some(item => item.name === name)) name = `${baseName.slice(0, 77)} ${number++}`;
  const copy = {
    ...original,
    id: crypto.randomUUID(), name,
    nodes: original.nodes.map(node => ({ ...node, id: nodeIds.get(node.id) })),
    edges: original.edges.map(edge => ({ ...edge, id: crypto.randomUUID(), from: nodeIds.get(edge.from), to: nodeIds.get(edge.to) })),
  };
  library.maps.push(copy);
  switchMap(copy.id);
}

function deleteMap() {
  if (drag || resize || connectionDrag || panDrag || marquee) return;
  if (editingId) document.activeElement?.blur();
  if (!window.confirm(`Delete "${map.name}"? This removes the map from this browser and cannot be undone.`)) return;
  const deletedId = map.id;
  const index = library.maps.findIndex(item => item.id === deletedId);
  library.maps.splice(index, 1);
  if (!library.maps.length) library.maps.push(blankMap());
  const next = library.maps[Math.min(index, library.maps.length - 1)];
  switchMap(next.id);
  histories.delete(deletedId);
  views.delete(deletedId);
}

function deleteSelected() {
  if (selectedEdgeId) {
    map.edges = map.edges.filter(edge => edge.id !== selectedEdgeId);
    selectedEdgeId = null;
    renderEdges();
    commit();
  } else if (selectedIds.size) {
    map.nodes = map.nodes.filter(node => !selectedIds.has(node.id));
    map.edges = map.edges.filter(edge => !selectedIds.has(edge.from) && !selectedIds.has(edge.to));
    selectedIds.clear();
    render();
    commit();
  }
  updateControls();
}

function isEditingText(event) {
  return editingId || event.target?.closest?.("input, textarea, [contenteditable='true']");
}

function copySelected(event, cut = false) {
  if (isEditingText(event) || !selectedIds.size || !event.clipboardData) return;
  const nodes = map.nodes.filter(node => selectedIds.has(node.id));
  const edges = map.edges.filter(edge => selectedIds.has(edge.from) && selectedIds.has(edge.to));
  const payload = { format: "open-map-bubbles", version: 1, nodes, edges };
  const plainText = nodes.map(node => node.text).join("\n");
  try {
    event.clipboardData.setData("text/plain", plainText);
    try { event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(payload)); }
    catch { /* Plain text and the in-page copy still support pasting. */ }
  } catch { return; }
  copiedBubbles = { payload: JSON.parse(JSON.stringify(payload)), plainText };
  event.preventDefault();
  if (cut) deleteSelected();
}

function pasteBubbles(event) {
  if (isEditingText(event) || !event.clipboardData) return;
  let payload;
  try { payload = JSON.parse(event.clipboardData.getData(CLIPBOARD_TYPE)); }
  catch { /* Use the in-page copy if the browser omits the custom clipboard type. */ }
  if (!payload && copiedBubbles && event.clipboardData.getData("text/plain") === copiedBubbles.plainText) {
    payload = copiedBubbles.payload;
  }
  if (payload?.format !== "open-map-bubbles" || payload.version !== 1) return;
  let source;
  try { source = normalizeMap(payload, "Clipboard"); }
  catch { return; }
  if (!source.nodes.length) return;
  event.preventDefault();
  const rect = workspace.getBoundingClientRect();
  const pointer = lastPointer || { clientX: rect.left + workspace.clientWidth / 2, clientY: rect.top + workspace.clientHeight / 2 };
  const point = canvasPoint(pointer);
  const left = Math.min(...source.nodes.map(node => node.x));
  const top = Math.min(...source.nodes.map(node => node.y));
  const right = Math.max(...source.nodes.map(node => node.x + node.width));
  const bottom = Math.max(...source.nodes.map(node => node.y + node.height));
  const dx = point.x - (left + right) / 2;
  const dy = point.y - (top + bottom) / 2;
  const ids = new Map(source.nodes.map(node => [node.id, crypto.randomUUID()]));
  const pastedNodes = source.nodes.map(node => ({ ...node, id: ids.get(node.id), x: node.x + dx, y: node.y + dy }));
  const pastedEdges = source.edges.map(edge => ({ ...edge, id: crypto.randomUUID(), from: ids.get(edge.from), to: ids.get(edge.to) }));
  map.nodes.push(...pastedNodes);
  map.edges.push(...pastedEdges);
  selectedIds = new Set(pastedNodes.map(node => node.id));
  selectedEdgeId = null;
  render();
  spreadNeighbors([...selectedIds]);
  renderEdges();
  commit();
}

function saveFile() {
  const file = new Blob([JSON.stringify({ format: "open-map", version: 1, map }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${map.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "map"}.openmap.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openFile(file) {
  try {
    const raw = JSON.parse(await file.text());
    const imported = normalizeMap(raw.map || raw, file.name.replace(/\.(openmap\.)?json$/i, ""));
    imported.id = crypto.randomUUID();
    library.maps.push(imported);
    save();
    switchMap(imported.id);
  } catch (error) {
    window.alert(`Could not open map: ${error.message}`);
  }
}

newMapButton.addEventListener("click", () => {
  const fresh = blankMap(`Untitled map ${library.maps.length + 1}`);
  library.maps.push(fresh);
  save();
  switchMap(fresh.id);
});
duplicateMapButton.addEventListener("click", duplicateMap);
deleteMapButton.addEventListener("click", deleteMap);
searchInput.addEventListener("input", updateSearch);
renameMapButton.addEventListener("click", renameMap);
saveFileButton.addEventListener("click", saveFile);
openFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  if (fileInput.files?.[0]) await openFile(fileInput.files[0]);
  fileInput.value = "";
});
deleteLinkButton.addEventListener("click", deleteSelected);
undoButton.addEventListener("click", () => travelHistory(-1));
redoButton.addEventListener("click", () => travelHistory(1));
fitAllButton.addEventListener("click", fitAll);
themeButton.addEventListener("click", toggleTheme);
moveToolButton.addEventListener("click", () => setPaintTool(null));
degreesUp.addEventListener("click", () => {
  degreeDepth = Math.min(10, degreeDepth + 1);
  updateControls();
});
degreesDown.addEventListener("click", () => {
  degreeDepth = Math.max(0, degreeDepth - 1);
  updateControls();
});
clearColorsButton.addEventListener("click", () => setPaintTool("clear"));
clearAllColorsButton.addEventListener("click", () => {
  if (editingId) document.activeElement?.blur();
  if (!map.nodes.some(node => node.groups.length)) return;
  for (const node of map.nodes) node.groups = [];
  paintColor = null;
  renderNodes();
  commit();
});

workspace.addEventListener("dblclick", event => {
  if (event.shiftKey || event.target.closest(".node, .connection")) return;
  const point = canvasPoint(event);
  addNode(point.x, point.y);
});
workspace.addEventListener("pointerdown", event => {
  if (!event.shiftKey || event.button !== 0 || editingId || event.target.closest(".resize-handle, input")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const point = screenPoint(event);
  marquee = {
    pointerId: event.pointerId, startX: point.x, startY: point.y,
    baseIds: new Set(selectedIds), clickedId: event.target.closest(".node")?.dataset.id || null,
    moved: false,
  };
  selectedEdgeId = null;
  selectionBox.hidden = false;
  selectionBox.style.left = `${point.x}px`;
  selectionBox.style.top = `${point.y}px`;
  selectionBox.style.width = "0px";
  selectionBox.style.height = "0px";
  workspace.setPointerCapture(event.pointerId);
  workspace.classList.add("selecting");
  updateControls();
}, true);
workspace.addEventListener("pointermove", event => {
  if (!marquee || event.pointerId !== marquee.pointerId) return;
  const point = screenPoint(event);
  if (!marquee.moved && Math.hypot(point.x - marquee.startX, point.y - marquee.startY) < 4) return;
  marquee.moved = true;
  const left = Math.min(marquee.startX, point.x);
  const top = Math.min(marquee.startY, point.y);
  const right = Math.max(marquee.startX, point.x);
  const bottom = Math.max(marquee.startY, point.y);
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${right - left}px`;
  selectionBox.style.height = `${bottom - top}px`;
  const worldLeft = (left - panX) / zoom;
  const worldTop = (top - panY) / zoom;
  const worldRight = (right - panX) / zoom;
  const worldBottom = (bottom - panY) / zoom;
  selectedIds = new Set(marquee.baseIds);
  for (const node of map.nodes) {
    if (node.x < worldRight && node.x + node.width > worldLeft && node.y < worldBottom && node.y + node.height > worldTop) selectedIds.add(node.id);
  }
  updateControls();
});
function endMarquee(event) {
  if (!marquee || event.pointerId !== marquee.pointerId) return;
  if (event.type === "pointercancel") selectedIds = new Set(marquee.baseIds);
  else if (!marquee.moved && marquee.clickedId) {
    selectedIds = new Set(marquee.baseIds);
    if (selectedIds.has(marquee.clickedId)) selectedIds.delete(marquee.clickedId);
    else selectedIds.add(marquee.clickedId);
  }
  marquee = null;
  selectionBox.hidden = true;
  workspace.classList.remove("selecting");
  updateControls();
}
workspace.addEventListener("pointerup", endMarquee);
workspace.addEventListener("pointercancel", endMarquee);
window.addEventListener("pointerup", endMarquee);
window.addEventListener("pointercancel", endMarquee);
workspace.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.shiftKey || event.target.closest(".node, .connection")) return;
  selectedIds.clear();
  selectedEdgeId = null;
  updateControls();
  panDrag = {
    pointerId: event.pointerId, x: event.clientX, y: event.clientY,
    panX, panY, moved: false,
  };
});
workspace.addEventListener("pointermove", event => {
  if (!panDrag || event.pointerId !== panDrag.pointerId) return;
  const dx = event.clientX - panDrag.x;
  const dy = event.clientY - panDrag.y;
  if (!panDrag.moved && Math.hypot(dx, dy) < 4) return;
  if (!panDrag.moved) {
    panDrag.moved = true;
    workspace.setPointerCapture(event.pointerId);
    workspace.classList.add("panning");
  }
  panX = panDrag.panX + dx;
  panY = panDrag.panY + dy;
  updateView(false);
});
function endPan(event) {
  if (!panDrag || event.pointerId !== panDrag.pointerId) return;
  panDrag = null;
  workspace.classList.remove("panning");
}
workspace.addEventListener("pointerup", endPan);
workspace.addEventListener("pointercancel", endPan);
window.addEventListener("pointerup", endPan);
window.addEventListener("pointercancel", endPan);
workspace.addEventListener("wheel", event => {
  event.preventDefault();
  const rect = workspace.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const worldX = (x - panX) / zoom;
  const worldY = (y - panY) / zoom;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? workspace.clientHeight : 1);
  setZoom(zoom * Math.exp(-delta * 0.0015));
  panX = x - worldX * zoom;
  panY = y - worldY * zoom;
  updateView(false);
}, { passive: false });
workspace.addEventListener("pointermove", event => { lastPointer = { clientX: event.clientX, clientY: event.clientY }; }, true);
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "z") { event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1); return; }
    if (key === "y") { event.preventDefault(); travelHistory(1); return; }
  }
  if (event.key === "Escape") setPaintTool(null);
  if ((event.key === "Delete" || event.key === "Backspace") && (selectedIds.size || selectedEdgeId) && !editingId) {
    event.preventDefault();
    deleteSelected();
  }
});
document.addEventListener("copy", event => copySelected(event));
document.addEventListener("cut", event => copySelected(event, true));
document.addEventListener("paste", pasteBubbles);

applyTheme();
renderMapList();
render();
save();
requestAnimationFrame(() => {
  setZoom(1);
  centerMap();
});
