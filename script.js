const STORAGE_KEY = "open-map-library-v2";
const LEGACY_STORAGE_KEY = "open-map-v1";
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const DEFAULT_WIDTH = 154;
const DEFAULT_HEIGHT = 82;
const MIN_WIDTH = 100;
const MIN_HEIGHT = 60;
const SPACING = 20;
const COLORS = [
  { name: "Red", swatch: "#e5484d", fill: "#ffd7d9" },
  { name: "Orange", swatch: "#ef8b2c", fill: "#ffe2c4" },
  { name: "Yellow", swatch: "#e3bd16", fill: "#fff1a8" },
  { name: "Green", swatch: "#35a76a", fill: "#c9f2d9" },
  { name: "Blue", swatch: "#3d87df", fill: "#cfe5ff" },
  { name: "Indigo", swatch: "#5958c8", fill: "#dcdcff" },
  { name: "Violet", swatch: "#a65acb", fill: "#efd6fa" },
];

const workspace = document.querySelector("#workspace");
const canvasFrame = document.querySelector("#canvas-frame");
const canvas = document.querySelector("#canvas");
const nodesLayer = document.querySelector("#nodes");
const connectionsLayer = document.querySelector("#connections");
const paletteLayer = document.querySelector("#palette-colors");
const mapList = document.querySelector("#map-list");
const newMapButton = document.querySelector("#new-map");
const renameMapButton = document.querySelector("#rename-map");
const saveFileButton = document.querySelector("#save-file");
const openFileButton = document.querySelector("#open-file");
const fileInput = document.querySelector("#file-input");
const deleteLinkButton = document.querySelector("#delete-link");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
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

function normalizeMap(raw, fallbackName = "Imported map") {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error("This file is not an Open Map map.");
  const nodes = raw.nodes.filter(node => node && typeof node.id === "string").map(node => ({
    id: node.id,
    x: Number.isFinite(node.x) ? clamp(node.x, 0, CANVAS_WIDTH - MIN_WIDTH) : 1000,
    y: Number.isFinite(node.y) ? clamp(node.y, 0, CANVAS_HEIGHT - MIN_HEIGHT) : 700,
    width: Number.isFinite(node.width) ? clamp(node.width, MIN_WIDTH, 600) : DEFAULT_WIDTH,
    height: Number.isFinite(node.height) ? clamp(node.height, MIN_HEIGHT, 300) : DEFAULT_HEIGHT,
    text: typeof node.text === "string" ? node.text.slice(0, 100) : "Untitled",
    groups: Array.isArray(node.groups) ? [...new Set(node.groups.filter(name => COLORS.some(color => color.name === name)))] : [],
  }));
  for (const node of nodes) {
    node.x = Math.min(node.x, CANVAS_WIDTH - node.width);
    node.y = Math.min(node.y, CANVAS_HEIGHT - node.height);
  }
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
  const first = blankMap();
  return { activeMapId: first.id, maps: [first] };
}

let library = loadLibrary();
let map = library.maps.find(item => item.id === library.activeMapId);
let history = [JSON.stringify(map)];
let historyIndex = 0;
const histories = new Map();
const views = new Map();
let selectedId = null;
let selectedEdgeId = null;
let paintColor = null;
let editingId = null;
let drag = null;
let resize = null;
let connectionDrag = null;
let panDrag = null;
let zoom = 1;

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
  if (drag || resize || connectionDrag || editingId) return;
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  historyIndex = next;
  map = JSON.parse(history[historyIndex]);
  library.maps[library.maps.findIndex(item => item.id === map.id)] = map;
  if (!map.nodes.some(node => node.id === selectedId)) selectedId = null;
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
  element.style.fontSize = `${(15 * reducedZoom ** -0.65).toFixed(2)}px`;
  element.style.padding = `${(15 * reducedZoom).toFixed(2)}px ${(20 * reducedZoom).toFixed(2)}px`;
  element.style.lineHeight = (1.05 + 0.2 * reducedZoom).toFixed(2);
}

function setZoom(next) {
  zoom = clamp(next, 0.3, 3);
  canvasFrame.style.width = `${CANVAS_WIDTH * zoom}px`;
  canvasFrame.style.height = `${CANVAS_HEIGHT * zoom}px`;
  canvas.style.transform = `scale(${zoom})`;
  for (const element of nodesLayer.children) applyNodeTypography(element);
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function centerMap() {
  const target = map.nodes[0] ? centerOf(map.nodes[0]) : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  workspace.scrollLeft = target.x * zoom - workspace.clientWidth / 2;
  workspace.scrollTop = target.y * zoom - workspace.clientHeight / 2;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
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
  const fills = node.groups.map(name => COLORS.find(color => color.name === name)?.fill).filter(Boolean);
  if (!fills.length) return "#f0f0f0";
  if (fills.length === 1) return fills[0];
  const step = 100 / fills.length;
  const stops = fills.flatMap((color, index) => [`${color} ${(index * step).toFixed(2)}%`, `${color} ${((index + 1) * step).toFixed(2)}%`]);
  return `linear-gradient(120deg, ${stops.join(", ")})`;
}

function renderEdges() {
  connectionsLayer.replaceChildren();
  for (const edge of map.edges) {
    const a = getNode(edge.from);
    const b = getNode(edge.to);
    if (!a || !b) continue;
    const start = ellipseEndpoint(a, b);
    const end = ellipseEndpoint(b, a);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("connection");
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
    group.addEventListener("pointerdown", event => { event.stopPropagation(); selectedId = null; selectedEdgeId = edge.id; updateControls(); });
    connectionsLayer.append(group);
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

function updateControls() {
  for (const element of nodesLayer.children) {
    element.classList.toggle("selected", element.dataset.id === selectedId);
  }
  for (const element of connectionsLayer.children) {
    if (element.classList.contains("connection")) element.classList.toggle("selected", element.dataset.id === selectedEdgeId);
  }
  deleteLinkButton.hidden = !selectedEdgeId;
  undoButton.disabled = historyIndex === 0;
  redoButton.disabled = historyIndex === history.length - 1;
  moveToolButton.setAttribute("aria-pressed", String(paintColor === null));
  clearColorsButton.setAttribute("aria-pressed", String(paintColor === "clear"));
  for (const button of paletteLayer.children) button.setAttribute("aria-pressed", String(button.dataset.color === paintColor));
  hint.textContent = selectedEdgeId ? "Connection selected. Press Delete or use Delete link."
    : connectionDrag ? "Release over another oval to connect."
    : resize ? "Drag the square to resize this oval."
    : paintColor === "clear" ? "Click an oval to remove all its colors. Drag to move it."
    : paintColor ? `Click ovals to toggle ${paintColor.toLowerCase()}. Drag to move them.`
    : "Drag empty space to pan. Scroll to zoom. Double-click to add an oval.";
}

function renderNodes() {
  nodesLayer.replaceChildren();
  for (const node of map.nodes) {
    const element = document.createElement("div");
    element.className = "node";
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
}

function render() { renderNodes(); renderEdges(); }
function selectNode(id) { selectedId = id; selectedEdgeId = null; updateControls(); }

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
    element.setAttribute("aria-label", `${node.text}${node.groups.length ? `, ${node.groups.join(", ")}` : ""}`);
  }
  commit();
}

// Keep the dragged or resized oval in place; move neighbors that overlap its box.
function spreadNeighbors(anchorId) {
  const anchor = getNode(anchorId);
  if (!anchor) return;
  const queue = [anchor];
  let steps = 0;
  while (queue.length && steps++ < 80) {
    const moving = queue.shift();
    for (const other of map.nodes) {
      if (other.id === moving.id || other.id === anchorId) continue;
      const a = centerOf(moving);
      const b = centerOf(other);
      const overlapX = (moving.width + other.width) / 2 + SPACING - Math.abs(b.x - a.x);
      const overlapY = (moving.height + other.height) / 2 + SPACING - Math.abs(b.y - a.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const beforeX = other.x;
      const beforeY = other.y;
      if (overlapX < overlapY) other.x += (b.x >= a.x ? 1 : -1) * overlapX;
      else other.y += (b.y >= a.y ? 1 : -1) * overlapY;
      other.x = clamp(other.x, 0, CANVAS_WIDTH - other.width);
      other.y = clamp(other.y, 0, CANVAS_HEIGHT - other.height);
      if (other.x === beforeX && other.y === beforeY) continue;
      const element = nodesLayer.querySelector(`[data-id="${other.id}"]`);
      if (element) { element.style.left = `${other.x}px`; element.style.top = `${other.y}px`; }
      queue.push(other);
    }
  }
}

function onNodeHover(event) {
  if (drag || resize || connectionDrag || editingId || event.target.closest(".resize-handle")) return;
  const node = getNode(event.currentTarget.dataset.id);
  event.currentTarget.classList.toggle("edge-ready", isNearEdge(node, canvasPoint(event)));
}

function onNodePointerDown(event) {
  if (event.button !== 0 || editingId || event.target.tagName === "INPUT" || event.target.closest(".resize-handle")) return;
  const element = event.currentTarget;
  const node = getNode(element.dataset.id);
  const point = canvasPoint(event);
  drag = { id: node.id, pointerId: event.pointerId, startX: point.x, startY: point.y, nodeX: node.x, nodeY: node.y, moved: false, edgeCandidate: isNearEdge(node, point) };
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
  const node = getNode(drag.id);
  node.x = clamp(drag.nodeX + dx, 0, CANVAS_WIDTH - node.width);
  node.y = clamp(drag.nodeY + dy, 0, CANVAS_HEIGHT - node.height);
  const element = event.currentTarget;
  element.classList.add("dragging");
  element.style.left = `${node.x}px`;
  element.style.top = `${node.y}px`;
  spreadNeighbors(node.id);
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
  selectNode(id);
  const node = getNode(id);
  const point = canvasPoint(event);
  resize = {
    id, corner, pointerId: event.pointerId, startX: point.x, startY: point.y,
    left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height,
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
  const node = getNode(resize.id);
  const point = canvasPoint(event);
  const dx = point.x - resize.startX;
  const dy = point.y - resize.startY;
  let { left, right, top, bottom } = resize;
  if (resize.corner.includes("w")) left = clamp(left + dx, Math.max(0, right - 600), right - MIN_WIDTH);
  else right = clamp(right + dx, left + MIN_WIDTH, Math.min(CANVAS_WIDTH, left + 600));
  if (resize.corner.includes("n")) top = clamp(top + dy, Math.max(0, bottom - 300), bottom - MIN_HEIGHT);
  else bottom = clamp(bottom + dy, top + MIN_HEIGHT, Math.min(CANVAS_HEIGHT, top + 300));
  node.x = left;
  node.y = top;
  node.width = right - left;
  node.height = bottom - top;
  const element = nodesLayer.querySelector(`[data-id="${node.id}"]`);
  element.style.left = `${node.x}px`;
  element.style.top = `${node.y}px`;
  element.style.width = `${node.width}px`;
  element.style.height = `${node.height}px`;
  spreadNeighbors(node.id);
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
    x: clamp(Math.round(x - DEFAULT_WIDTH / 2), 0, CANVAS_WIDTH - DEFAULT_WIDTH),
    y: clamp(Math.round(y - DEFAULT_HEIGHT / 2), 0, CANVAS_HEIGHT - DEFAULT_HEIGHT),
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
  if (id === library.activeMapId || drag || resize || connectionDrag || panDrag) return;
  if (editingId) document.activeElement?.blur();
  histories.set(map.id, { entries: history, index: historyIndex });
  views.set(map.id, { zoom, scrollLeft: workspace.scrollLeft, scrollTop: workspace.scrollTop });
  library.activeMapId = id;
  map = library.maps.find(item => item.id === id);
  const previous = histories.get(id);
  history = previous?.entries || [JSON.stringify(map)];
  historyIndex = previous?.index ?? 0;
  selectedId = null;
  selectedEdgeId = null;
  render();
  renderMapList();
  save();
  requestAnimationFrame(() => {
    const view = views.get(id);
    setZoom(view?.zoom ?? 1);
    if (view) { workspace.scrollLeft = view.scrollLeft; workspace.scrollTop = view.scrollTop; }
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

function deleteSelected() {
  if (selectedEdgeId) {
    map.edges = map.edges.filter(edge => edge.id !== selectedEdgeId);
    selectedEdgeId = null;
    renderEdges();
    commit();
  } else if (selectedId) {
    map.nodes = map.nodes.filter(node => node.id !== selectedId);
    map.edges = map.edges.filter(edge => edge.from !== selectedId && edge.to !== selectedId);
    selectedId = null;
    render();
    commit();
  }
  updateControls();
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
moveToolButton.addEventListener("click", () => setPaintTool(null));
clearColorsButton.addEventListener("click", () => setPaintTool("clear"));
clearAllColorsButton.addEventListener("click", () => {
  if (editingId) document.activeElement?.blur();
  if (!map.nodes.some(node => node.groups.length)) return;
  for (const node of map.nodes) node.groups = [];
  paintColor = null;
  renderNodes();
  commit();
});

canvas.addEventListener("dblclick", event => {
  if (event.target.closest(".node, .connection")) return;
  const point = canvasPoint(event);
  addNode(point.x, point.y);
});
canvas.addEventListener("pointerdown", event => {
  if (event.target.closest(".node")) return;
  selectedId = null;
  selectedEdgeId = null;
  updateControls();
});
workspace.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.target.closest(".node, .connection")) return;
  panDrag = {
    pointerId: event.pointerId, x: event.clientX, y: event.clientY,
    scrollLeft: workspace.scrollLeft, scrollTop: workspace.scrollTop, moved: false,
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
  workspace.scrollLeft = panDrag.scrollLeft - dx;
  workspace.scrollTop = panDrag.scrollTop - dy;
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
  const worldX = (workspace.scrollLeft + x) / zoom;
  const worldY = (workspace.scrollTop + y) / zoom;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? workspace.clientHeight : 1);
  setZoom(zoom * Math.exp(-delta * 0.0015));
  workspace.scrollLeft = worldX * zoom - x;
  workspace.scrollTop = worldY * zoom - y;
}, { passive: false });
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "z") { event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1); return; }
    if (key === "y") { event.preventDefault(); travelHistory(1); return; }
  }
  if (event.key === "Escape") setPaintTool(null);
  if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedEdgeId) && !editingId) {
    event.preventDefault();
    deleteSelected();
  }
});

renderMapList();
render();
save();
requestAnimationFrame(() => {
  setZoom(1);
  centerMap();
});
