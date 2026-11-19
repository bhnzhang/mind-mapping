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

const ids = ["workspace", "canvas-frame", "canvas", "nodes", "connections", "palette-colors", "map-list", "new-map", "rename-map", "save-file", "open-file", "file-input", "delete-link", "undo", "redo", "move-tool", "clear-colors", "clear-all-colors", "hint", "zoom-label"];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
const storage = new Map();
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
  window: { prompt: () => "Career ideas", alert: message => { throw new Error(message); }, addEventListener() {} },
  requestAnimationFrame: callback => callback(),
  setTimeout,
  URL,
  Blob,
});
const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
vm.runInContext(source, context);
const run = code => vm.runInContext(code, context);

assert.equal(run("library.maps.length"), 1);
elements["new-map"].click();
assert.equal(run("library.maps.length"), 2);
elements["rename-map"].click();
assert.equal(run("map.name"), "Career ideas");
elements.undo.click();
assert.equal(run("map.name"), "Untitled map 2");
elements.redo.click();
assert.equal(run("map.name"), "Career ideas");

run("map.nodes.push({ id: crypto.randomUUID(), x: 900, y: 700, width: 154, height: 82, text: 'Second', groups: [] }); commit(); render();");
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

run("setZoom(0.5)");
const zoomedOutFont = Number.parseFloat(elements.nodes.children[0].style.fontSize);
assert.ok(zoomedOutFont > 15);
assert.ok(zoomedOutFont * 0.5 > 7.5 && zoomedOutFont * 0.5 < 15);
run("renderNodes()");
assert.equal(Number.parseFloat(elements.nodes.children[0].style.fontSize), zoomedOutFont);
run("setZoom(2)");
assert.equal(elements["zoom-label"].textContent, "200%");
assert.equal(run("canvasPoint({ clientX: 300, clientY: 200 }).x"), 150);
elements.workspace.scrollLeft = 500;
elements.workspace.scrollTop = 400;
const anchoredBefore = run("(workspace.scrollLeft + 200) / zoom");
elements.workspace.listeners.wheel[0]({ clientX: 200, clientY: 100, deltaY: -120, deltaMode: 0, preventDefault() {} });
const anchoredAfter = run("(workspace.scrollLeft + 200) / zoom");
assert.ok(Math.abs(anchoredAfter - anchoredBefore) < 0.001);
const scrollBeforePan = elements.workspace.scrollLeft;
const background = { closest: () => null };
elements.workspace.listeners.pointerdown[0]({ button: 0, pointerId: 3, clientX: 500, clientY: 300, target: background });
elements.workspace.listeners.pointermove[0]({ pointerId: 3, clientX: 550, clientY: 300 });
assert.equal(elements.workspace.scrollLeft, scrollBeforePan - 50);
elements.workspace.listeners.pointerup[0]({ pointerId: 3 });

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
  storage.delete("open-map-library-v2");
  storage.set("open-map-v1", JSON.stringify({ nodes: [{ id: "old-node", x: 100, y: 100, text: "Legacy idea" }], edges: [] }));
  assert.equal(run("loadLibrary().maps[0].nodes[0].text"), "Legacy idea");
  console.log("Smoke test passed: maps, history, links, color clearing, resize, pan, zoom, readable labels, files, and migration.");
}).catch(error => { console.error(error); process.exitCode = 1; });
