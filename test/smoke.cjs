const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.value = "";
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    this.clientWidth = 1000;
    this.clientHeight = 800;
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  removeEventListener(name, callback) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== callback); }
  setAttribute(name, value) { this[name] = String(value); }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  setPointerCapture() {}
  querySelector(selector) {
    const id = /^\[data-id="(.+)"\]$/.exec(selector)?.[1];
    return this.children.find(child => child.dataset.id === id) || null;
  }
  click() { for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
  remove() {}
}

const ids = ["workspace", "canvas", "selection-box", "nodes", "connections", "crossing-connections", "palette-colors", "map-list", "search-nodes", "search-count", "new-map", "duplicate-map", "rename-map", "delete-map", "save-file", "open-file", "file-input", "delete-link", "undo", "redo", "fit-all", "move-tool", "clear-colors", "clear-all-colors", "hint", "zoom-label"];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const storage = new Map();
let confirmResult = true;
const document = {
  querySelector: selector => elements[selector.slice(1)],
  createElement: tag => new Element(tag),
  createElementNS: (_namespace, tag) => new Element(tag),
  body: new Element("body"),
  addEventListener() {},
};
const context = vm.createContext({
  document,
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  crypto,
  window: { prompt: () => "Career ideas", confirm: () => confirmResult, alert: message => { throw new Error(message); }, addEventListener() {} },
  requestAnimationFrame: callback => callback(),
  setTimeout,
  URL,
  Blob,
});
const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);

assert.equal(run("library.maps.length"), 1);
assert.equal(run("map.nodes.length"), 6);
assert.equal(run("map.edges.length"), 5);
assert.equal(run("map.nodes[0].text"), "My ideas");
assert.equal(run("map.nodes.slice(1).every((node, index) => node.text === `Idea ${index + 1}`)"), true);
assert.equal(run("map.edges.every(edge => edge.from === map.nodes[0].id && map.nodes.some(node => node.id === edge.to))"), true);
elements["new-map"].click();
assert.equal(run("library.maps.length"), 2);
assert.equal(run("map.nodes.length"), 1);
assert.equal(run("map.edges.length"), 0);
elements["rename-map"].click();
assert.equal(run("map.name"), "Career ideas");
elements.undo.click();
assert.equal(run("map.name"), "Untitled map 2");
elements.redo.click();
assert.equal(run("map.name"), "Career ideas");

run("map.nodes.push({ id: crypto.randomUUID(), x: 900, y: 700, width: 154, height: 82, text: 'Second', groups: [] }); commit(); render();");
elements["search-nodes"].value = "CoN";
elements["search-nodes"].listeners.input[0]();
assert.equal(elements.nodes.children[1].classList.contains("search-match"), true);
assert.equal(elements.nodes.children[0].classList.contains("search-dim"), true);
assert.equal(elements["search-count"].textContent, "1 of 2 bubbles match");
elements["search-nodes"].value = "";
elements["search-nodes"].listeners.input[0]();
assert.equal(elements.nodes.children[0].classList.contains("search-dim"), false);
run("addEdge(map.nodes[0].id, map.nodes[1].id)");
assert.equal(run("map.edges.length"), 1);
const edge = elements.connections.children[0];
edge.listeners.pointerdown[0]({ stopPropagation() {} });
assert.equal(elements["delete-link"].hidden, false);
elements["delete-link"].click();
assert.equal(run("map.edges.length"), 0);
elements.undo.click();
assert.equal(run("map.edges.length"), 1);

run(`{
  setPaintTool("Red");
  const node = map.nodes[0];
  const element = nodesLayer.children[0];
  onNodePointerDown({ button: 0, pointerId: 1, clientX: node.x + node.width - 2, clientY: node.y + node.height / 2,
    target: { tagName: "DIV", closest: () => null }, currentTarget: element });
  onNodePointerUp({ type: "pointerup", pointerId: 1, currentTarget: element });
}`);
assert.equal(run('map.nodes[0].groups.includes("Red")'), true);
run('paintNode(map.nodes[1].id)');
elements["clear-all-colors"].click();
assert.equal(run('map.nodes.every(node => node.groups.length === 0)'), true);
elements.undo.click();
assert.equal(run('map.nodes.every(node => node.groups.includes("Red"))'), true);

const widthBefore = run("map.nodes[0].width");
run(`{
  const node = map.nodes[0];
  const grip = nodesLayer.children[0].children.find(child => child.className === "resize-handle nw");
  startResize({ button: 0, pointerId: 2, clientX: node.x, clientY: node.y, currentTarget: grip,
    preventDefault() {}, stopPropagation() {} }, node.id, "nw");
  moveResize({ pointerId: 2, clientX: node.x - 20, clientY: node.y - 10 });
  endResize({ pointerId: 2, currentTarget: grip });
}`);
assert.equal(run("map.nodes[0].width"), widthBefore + 20);
run(`{
  const node = map.nodes[0];
  const grip = nodesLayer.children[0].children.find(child => child.className === "resize-handle se");
  startResize({ button: 0, pointerId: 6, clientX: node.x + node.width, clientY: node.y + node.height, currentTarget: grip,
    preventDefault() {}, stopPropagation() {} }, node.id, "se");
  moveResize({ pointerId: 6, clientX: node.x + node.width + 1000, clientY: node.y + node.height + 500 });
  endResize({ pointerId: 6, currentTarget: grip });
}`);
assert.ok(run("map.nodes[0].width") > 600);
assert.ok(run("map.nodes[0].height") > 300);
assert.equal(run("normalizeMap(map).nodes[0].width"), run("map.nodes[0].width"));
assert.equal(run("normalizeMap(map).nodes[0].height"), run("map.nodes[0].height"));

run("setZoom(0.5)");
const zoomedOutFont = Number.parseFloat(elements.nodes.children[0].style.fontSize);
assert.ok(zoomedOutFont > 15);
assert.ok(zoomedOutFont * 0.5 > 7.5 && zoomedOutFont * 0.5 < 15);
run("renderNodes()");
assert.equal(Number.parseFloat(elements.nodes.children[0].style.fontSize), zoomedOutFont);
run("panX = 0; panY = 0; setZoom(2)");
assert.equal(elements["zoom-label"].textContent, "200%");
assert.equal(run("canvasPoint({ clientX: 300, clientY: 200 }).x"), 150);
run("panX = 500; panY = 400; updateView()");
const anchoredBefore = run("(200 - panX) / zoom");
elements.workspace.listeners.wheel[0]({ clientX: 200, clientY: 100, deltaY: -120, deltaMode: 0, preventDefault() {} });
const anchoredAfter = run("(200 - panX) / zoom");
assert.ok(Math.abs(anchoredAfter - anchoredBefore) < 0.001);
const panBefore = run("panX");
const background = { closest: () => null };
elements.workspace.listeners.pointerdown[1]({ button: 0, pointerId: 3, clientX: 500, clientY: 300, target: background });
elements.workspace.listeners.pointermove[1]({ pointerId: 3, clientX: 550, clientY: 300 });
assert.equal(run("panX"), panBefore + 50);
elements.workspace.listeners.pointerup[1]({ pointerId: 3 });
run("panX = -1000000; panY = 1000000; updateView(false)");
assert.equal(run("panX"), -1000000);
assert.equal(run("panY"), 1000000);
run("map.nodes[1].x = -5000; map.nodes[1].y = 8000; render()");
assert.equal(run("normalizeMap(map).nodes[1].x"), -5000);
elements["fit-all"].click();
assert.ok(run("Math.min(...map.nodes.map(node => node.x * zoom + panX))") >= 0);
assert.ok(run("Math.max(...map.nodes.map(node => (node.x + node.width) * zoom + panX))") <= elements.workspace.clientWidth);
assert.ok(run("Math.min(...map.nodes.map(node => node.y * zoom + panY))") >= 0);
assert.ok(run("Math.max(...map.nodes.map(node => (node.y + node.height) * zoom + panY))") <= elements.workspace.clientHeight);
run("map.nodes[0].x = 100; map.nodes[0].y = 100; map.nodes[1].x = 300; map.nodes[1].y = 100; panX = 0; panY = 0; setZoom(1); render()");
elements.workspace.listeners.pointerdown[0]({ shiftKey: true, button: 0, pointerId: 4, clientX: 50, clientY: 50,
  target: background, preventDefault() {}, stopImmediatePropagation() {} });
elements.workspace.listeners.pointermove[0]({ pointerId: 4, clientX: 500, clientY: 250 });
elements.workspace.listeners.pointerup[0]({ type: "pointerup", pointerId: 4 });
assert.equal(run("selectedIds.size"), 2);
const sourceNode = elements.nodes.children[0];
const sourceTarget = { tagName: "DIV", closest: () => null };
context.sourceNode = sourceNode;
context.sourceTarget = sourceTarget;
run("setPaintTool(null)");
run("onNodePointerDown({ button: 0, pointerId: 5, clientX: 177, clientY: 141, target: sourceTarget, currentTarget: sourceNode })");
run("onNodePointerMove({ pointerId: 5, clientX: 217, clientY: 171, currentTarget: sourceNode })");
run("onNodePointerUp({ type: 'pointerup', pointerId: 5, currentTarget: sourceNode })");
assert.equal(run("map.nodes[0].x"), 140);
assert.equal(run("map.nodes[1].x"), 340);

assert.equal(JSON.parse(storage.get("open-map-library-v2")).maps.length, 2);
run("saveFile()");
assert.match(document.body.children.at(-1).download, /\.openmap\.json$/);

context.importedFile = {
  name: "backup.openmap.json",
  text: async () => run('JSON.stringify({ format: "open-map", version: 1, map })'),
};
run("openFile(importedFile)").then(() => {
  assert.equal(run("library.maps.length"), 3);
  assert.equal(run("map.name"), "Career ideas");
  const originalId = run("map.id");
  const originalNodeId = run("map.nodes[0].id");
  const originalNodeText = run("map.nodes[0].text");
  const originalEdgeCount = run("map.edges.length");
  const originalGroups = run("JSON.stringify(map.nodes[0].groups)");
  elements["duplicate-map"].click();
  assert.equal(run("library.maps.length"), 4);
  assert.equal(run("map.name"), "Career ideas copy");
  assert.notEqual(run("map.id"), originalId);
  assert.notEqual(run("map.nodes[0].id"), originalNodeId);
  assert.equal(run("map.edges.length"), originalEdgeCount);
  assert.equal(run("JSON.stringify(map.nodes[0].groups)"), originalGroups);
  assert.equal(run("map.edges.every(edge => map.nodes.some(node => node.id === edge.from) && map.nodes.some(node => node.id === edge.to))"), true);
  run("map.nodes[0].text = 'Changed only in copy'; commit()");
  context.originalId = originalId;
  run("switchMap(originalId)");
  assert.equal(run("map.nodes[0].text"), originalNodeText);
  elements["duplicate-map"].click();
  assert.equal(run("map.name"), "Career ideas copy 2");
  storage.delete("open-map-library-v2");
  storage.set("open-map-v1", JSON.stringify({ nodes: [{ id: "old-node", x: 100, y: 100, text: "Legacy idea" }], edges: [] }));
  assert.equal(run("loadLibrary().maps[0].nodes[0].text"), "Legacy idea");
  run(`{
    const savedNodes = map.nodes;
    const savedEdges = map.edges;
    map.nodes = [
      { id: "a", x: 0, y: 0, width: 100, height: 60, text: "A", groups: [] },
      { id: "b", x: 400, y: 0, width: 100, height: 60, text: "B", groups: [] },
      { id: "c", x: 200, y: 0, width: 100, height: 60, text: "C", groups: [] },
    ];
    map.edges = [{ id: "a-b", from: "a", to: "b" }];
    renderEdges();
    globalThis.crossingTest = { savedNodes, savedEdges };
  }`);
  assert.equal(elements["crossing-connections"].children.length, 1);
  assert.equal(elements.connections.children.length, 0);
  assert.equal(elements["crossing-connections"].children[0].classList.contains("crossing"), true);
  elements["crossing-connections"].children[0].listeners.pointerdown[0]({ stopPropagation() {} });
  assert.equal(elements["crossing-connections"].children[0].classList.contains("selected"), true);
  run("map.nodes[2].y = 200; renderEdges()");
  assert.equal(elements["crossing-connections"].children.length, 0);
  assert.equal(elements.connections.children.length, 1);
  run("map.nodes = crossingTest.savedNodes; map.edges = crossingTest.savedEdges; selectedEdgeId = null; renderEdges()");
  const mapCount = run("library.maps.length");
  const deletedId = run("map.id");
  context.deletedId = deletedId;
  confirmResult = false;
  elements["delete-map"].click();
  assert.equal(run("library.maps.length"), mapCount);
  confirmResult = true;
  elements["delete-map"].click();
  assert.equal(run("library.maps.length"), mapCount - 1);
  assert.notEqual(run("map.id"), deletedId);
  assert.equal(run("library.maps.some(item => item.id === globalThis.deletedId)"), false);
  assert.equal(JSON.parse(storage.get("open-map-library-v2")).maps.length, mapCount - 1);
  assert.equal(run("histories.has(globalThis.deletedId)"), false);
  while (run("library.maps.length") > 1) elements["delete-map"].click();
  const lastId = run("map.id");
  elements["delete-map"].click();
  assert.equal(run("library.maps.length"), 1);
  assert.notEqual(run("map.id"), lastId);
  assert.equal(run("map.nodes.length"), 1);
  console.log("Smoke test passed: starter map, maps, duplication, deletion, history, links, colors, search, unlimited resize, crossing links, pan, fit all, multi-selection, zoom, files, and migration.");
}).catch(error => { console.error(error); process.exitCode = 1; });
