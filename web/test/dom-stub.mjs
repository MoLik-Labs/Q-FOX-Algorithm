/**
 * A DOM just complete enough to run this site's front end under Node.
 *
 * The views build real elements, so the only way to find out whether they draw
 * is to draw them.  This stub implements exactly the surface `util.js`,
 * `cube-view.js` and the views touch -- no more -- and deliberately does NOT
 * run timers or animation frames: a render that needs one to finish would hang
 * the test, and a render that only schedules one is what we want to check.
 *
 * Not a browser.  Anything visual still needs eyes; this catches the things
 * eyes are bad at finding one by one: a property read on undefined, a wrong
 * lookup key, a view that throws for one parameter out of thirteen.
 */

class Style {
  constructor() { this._props = new Map(); }
  setProperty(k, v) { this._props.set(k, String(v)); }
  getPropertyValue(k) { return this._props.get(k) || ""; }
  removeProperty(k) { this._props.delete(k); }
}

class ClassList {
  constructor(node) { this.node = node; }
  get _set() { return new Set(String(this.node.className || "").split(/\s+/).filter(Boolean)); }
  _write(s) { this.node.className = [...s].join(" "); }
  add(...c) { const s = this._set; for (const x of c) s.add(x); this._write(s); }
  remove(...c) { const s = this._set; for (const x of c) s.delete(x); this._write(s); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const s = this._set;
    const on = force === undefined ? !s.has(c) : !!force;
    if (on) s.add(c); else s.delete(c);
    this._write(s);
    return on;
  }
  get length() { return this._set.size; }
  [Symbol.iterator]() { return this._set[Symbol.iterator](); }
}

class TextNode {
  constructor(text) { this.nodeType = 3; this._text = String(text); this.parentNode = null; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get data() { return this._text; }
  cloneNode() { return new TextNode(this._text); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

class Fragment {
  constructor() { this.nodeType = 11; this.childNodes = []; this.parentNode = null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  append(...kids) {
    for (const k of kids.flat(9)) {
      if (k === null || k === undefined) continue;
      if (k.nodeType === 11) { this.childNodes.push(...k.childNodes); k.childNodes = []; }
      else { k.parentNode = this; this.childNodes.push(k); }
    }
  }
  appendChild(k) { this.append(k); return k; }
  removeChild(k) {
    const i = this.childNodes.indexOf(k);
    if (i >= 0) this.childNodes.splice(i, 1);
    k.parentNode = null;
    return k;
  }
  cloneNode() { const f = new Fragment(); f.childNodes = this.childNodes.slice(); return f; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
}

const SEL = /^\s*(?:([a-zA-Z][\w-]*)|\#([\w-]+)|\.([\w-]+))\s*$/;

function matchesSel(node, sel) {
  return String(sel).split(",").some((one) => {
    const m = SEL.exec(one.trim());
    if (!m) return false;
    if (m[1]) return node.tagName === m[1].toUpperCase();
    if (m[2]) return node.attributes.id === m[2];
    if (m[3]) return (node.classList || { contains: () => false }).contains(m[3]);
    return false;
  });
}

class Element {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.nodeType = 1;
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.style = new Style();
    this.listeners = {};
    this.className = "";
    this.parentNode = null;
    this.value = "";
    this.files = [];
    this.checked = false;
    this.scrollTop = 0;
    this._html = "";
  }

  /* ------------------------------------------------------------- children */
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get childElementCount() { return this.children.length; }

  append(...kids) {
    for (const k of kids.flat(9)) {
      if (k === null || k === undefined || k === false) continue;
      if (k.nodeType === 11) {
        for (const c of k.childNodes.slice()) { c.parentNode = this; this.childNodes.push(c); }
        k.childNodes = [];
      } else {
        if (k.parentNode) k.parentNode.removeChild(k);
        k.parentNode = this;
        this.childNodes.push(k);
      }
    }
  }
  appendChild(k) { this.append(k); return k; }
  prepend(...kids) {
    this.append(...kids);
    const added = kids.flat(9).filter(Boolean);
    this.childNodes.sort((a, b) => added.indexOf(a) >= 0 && added.indexOf(b) < 0 ? 1 : 0);
  }
  insertBefore(k, ref) {
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (k.parentNode) k.parentNode.removeChild(k);
    k.parentNode = this;
    if (i < 0) this.childNodes.push(k); else this.childNodes.splice(i, 0, k);
    return k;
  }
  removeChild(k) {
    const i = this.childNodes.indexOf(k);
    if (i >= 0) this.childNodes.splice(i, 1);
    k.parentNode = null;
    return k;
  }
  replaceChildren(...kids) {
    for (const c of this.childNodes.slice()) c.parentNode = null;
    this.childNodes = [];
    this.append(...kids);
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) {
    if (n === this) return true;
    return this.childNodes.some((c) => c.contains && c.contains(n));
  }
  cloneNode(deep) {
    const c = new Element(this.tagName.toLowerCase());
    c.attributes = { ...this.attributes };
    c.className = this.className;
    c.dataset = { ...this.dataset };
    c._text = this._text;
    if (deep) for (const k of this.childNodes) c.append(k.cloneNode(true));
    return c;
  }

  /* -------------------------------------------------------------- content */
  get textContent() {
    if (this._leafText !== undefined && !this.childNodes.length) return this._leafText;
    return this.childNodes.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    for (const c of this.childNodes.slice()) c.parentNode = null;
    this.childNodes = [];
    this._leafText = String(v);
    if (this._leafText !== "") this.append(new TextNode(this._leafText));
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get outerHTML() { return `<${this.tagName.toLowerCase()}>`; }

  /* ----------------------------------------------------------- attributes */
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === "class") this.className = String(v);
    if (k === "id") this.id = String(v);
    if (k.startsWith("data-")) {
      const name = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[name] = String(v);
    }
  }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  get classList() { return new ClassList(this); }
  get id() { return this.attributes.id || ""; }
  set id(v) { this.attributes.id = String(v); }

  /* ---------------------------------------------------------------- events */
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this.listeners[type];
    if (l) this.listeners[type] = l.filter((f) => f !== fn);
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    if (!ev.preventDefault) ev.preventDefault = function () { this.defaultPrevented = true; };
    if (!ev.stopPropagation) ev.stopPropagation = function () { this._stopped = true; };
    let node = this;
    while (node) {
      ev.currentTarget = node;
      // both wiring styles the site uses: addEventListener() and `node.onclick =`
      const direct = node[`on${ev.type}`];
      if (typeof direct === "function") direct.call(node, ev);
      for (const fn of (node.listeners[ev.type] || []).slice()) fn.call(node, ev);
      if (ev._stopped || !ev.bubbles) break;
      node = node.parentNode;
    }
    return !ev.defaultPrevented;
  }
  click() {
    this.dispatchEvent({ type: "click", bubbles: true, target: this,
                         preventDefault() { this.defaultPrevented = true; },
                         stopPropagation() { this._stopped = true; } });
  }

  /* ------------------------------------------------------------- querying */
  matches(sel) { return matchesSel(this, sel); }
  closest(sel) {
    let n = this;
    while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 1) { if (matchesSel(c, sel)) out.push(c); walk(c); }
        else if (c.nodeType === 11) walk(c);
      }
    };
    walk(this);
    return out;
  }
  getElementsByTagName(t) { return this.querySelectorAll(t); }

  /* ------------------------------------------------------- browser extras */
  focus() { document.activeElement = this; }
  blur() { if (document.activeElement === this) document.activeElement = null; }
  select() {}
  scrollIntoView() {}
  scrollTo() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }; }
  get content() {                    // <template>
    const f = new Fragment();
    f.childNodes = this.childNodes.slice();
    return f;
  }
}

class Doc extends Element {
  constructor() {
    super("document");
    this.nodeType = 9;
    this.title = "";
    this.activeElement = null;
    this.readyState = "complete";
    this.body = new Element("body");
    this.documentElement = new Element("html");
    this.head = new Element("head");
    this.documentElement.append(this.head, this.body);
    this.body.parentNode = this.documentElement;
    this.head.parentNode = this.documentElement;
    this._byId = new Map();
  }
  createElement(tag) { return new Element(tag); }
  createElementNS(_ns, tag) { return new Element(tag); }
  createTextNode(text) { return new TextNode(text); }
  createDocumentFragment() { return new Fragment(); }
  getElementById(id) {
    if (this._byId.has(id)) return this._byId.get(id);
    const found = this.querySelector(`#${id}`);
    if (found) return found;
    const made = new Element("div");     // the page shell asks for these by id
    made.id = id;
    this._byId.set(id, made);
    this.body.append(made);
    return made;
  }
  execCommand() { return true; }
}

/** Install the stub on globalThis.  Returns helpers the test can use. */
export function installDom() {
  const document = new Doc();
  const timers = [];
  const frames = [];

  const window = {
    document,
    location: { hash: "#/", href: "http://localhost:8080/", search: "", origin: "http://localhost:8080" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener: (t, f) => document.addEventListener(t, f),
    removeEventListener: (t, f) => document.removeEventListener(t, f),
    dispatchEvent: (e) => document.dispatchEvent(e),
    scrollTo() {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelAnimationFrame() {},
    localStorage: makeStorage(),
    navigator: { clipboard: { writeText: async () => { throw new Error("no clipboard in node"); } } },
    innerWidth: 1440, innerHeight: 900,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; this.bubbles = !!init.bubbles; }
    },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    URL,
  };

  function makeStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  }

  // several of these are getter-only on globalThis in modern Node, so they have
  // to be redefined rather than assigned
  const define = (k, v) => {
    try { globalThis[k] = v; }
    catch { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); }
    if (globalThis[k] !== v) {
      Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
    }
  };
  define("document", document);
  define("window", window);
  define("location", window.location);
  define("navigator", window.navigator);
  define("localStorage", window.localStorage);
  define("requestAnimationFrame", window.requestAnimationFrame);
  define("cancelAnimationFrame", window.cancelAnimationFrame);
  define("getComputedStyle", window.getComputedStyle);
  define("CustomEvent", window.CustomEvent);
  define("MutationObserver", window.MutationObserver);
  define("fetch", undefined);            // the test installs its own
  // `setTimeout`/`clearTimeout` are already global in Node; shadow them so no
  // view can start real work the test cannot observe.
  define("setTimeout", window.setTimeout);
  define("clearTimeout", window.clearTimeout);
  define("setInterval", (fn, ms) => { timers.push({ fn, ms, interval: true }); return timers.length; });
  define("clearInterval", () => {});

  return {
    document, window, timers, frames,
    /** Fire every scheduled timer once, the way a browser would. */
    runTimers() { const t = timers.splice(0, timers.length); for (const x of t) x.fn(); },
    /** Fire one animation frame with a synthetic timestamp. */
    runFrame(now = performance.now()) { const f = frames.splice(0, frames.length); for (const cb of f) cb(now); },
    hash(h) {
      window.location.hash = h;
      document.dispatchEvent({ type: "hashchange", bubbles: false, target: window,
                                preventDefault() {}, stopPropagation() {} });
    },
    /** How many elements a subtree holds, and its text, for assertions. */
    stats(node) {
      let n = 0, text = "";
      const walk = (x) => {
        if (x.nodeType === 3) { text += x.textContent; return; }
        if (x.nodeType === 1) n++;
        for (const c of x.childNodes || []) walk(c);
      };
      walk(node);
      return { elements: n, text: text.replace(/\s+/g, " ").trim(), length: text.length };
    },
  };
}
