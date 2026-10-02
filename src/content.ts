console.log("[Define] content script loaded (v4)");

// ---------- UI: one host element with a shadow root ----------
const host = document.createElement("div");
host.style.all = "initial";
host.style.position = "fixed";
host.style.zIndex = "2147483647";
host.style.display = "none";

const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button.define {
      font: 14px system-ui, sans-serif;
      color: #fff;
      background: #2f2f2f;
      border: 1px solid #444;
      border-radius: 10px;
      padding: 6px 12px;
      cursor: pointer;
    }
    button.define:hover { background: #3b3b3b; }
    .card {
      font: 14px/1.5 system-ui, sans-serif;
      color: #ececec;
      background: #2f2f2f;
      border: 1px solid #444;
      border-radius: 12px;
      padding: 12px 14px;
      width: 300px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      animation: pop 120ms ease-out;
    }
    @keyframes pop {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: none; }
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .term { font-weight: 600; }
    .close {
      background: none;
      border: none;
      color: #9a9a9a;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    }
    .close:hover { color: #fff; }
    .body { color: #cfcfcf; }
    .error { color: #f0a4a4; }
    .loading { display: flex; gap: 4px; padding: 6px 0; }
    .loading span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #9a9a9a;
      animation: blink 1s infinite ease-in-out;
    }
    .loading span:nth-child(2) { animation-delay: 0.15s; }
    .loading span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes blink {
      0%, 80%, 100% { opacity: 0.25; }
      40% { opacity: 1; }
    }
    .retry {
      margin-top: 8px;
      font: 13px system-ui, sans-serif;
      color: #fff;
      background: #3b3b3b;
      border: 1px solid #555;
      border-radius: 8px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .context {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #444;
      font-size: 12px;
      color: #9a9a9a;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  </style>
  <button class="define" type="button">Define</button>
  <div class="card" hidden>
    <div class="head">
      <div class="term"></div>
      <button class="close" type="button" aria-label="Close">×</button>
    </div>
    <div class="loading"><span></span><span></span><span></span></div>
    <div class="body" hidden></div>
    <button class="retry" type="button" hidden>Try again</button>
    <div class="context"></div>
  </div>
`;
document.body.appendChild(host);

const button = shadow.querySelector<HTMLButtonElement>("button.define")!;
const card = shadow.querySelector<HTMLDivElement>(".card")!;
const termEl = shadow.querySelector<HTMLDivElement>(".term")!;
const closeBtn = shadow.querySelector<HTMLButtonElement>(".close")!;
const loadingEl = shadow.querySelector<HTMLDivElement>(".loading")!;
const bodyEl = shadow.querySelector<HTMLDivElement>(".body")!;
const retryBtn = shadow.querySelector<HTMLButtonElement>(".retry")!;
const contextEl = shadow.querySelector<HTMLDivElement>(".context")!;

// ---------- State ----------
type Extra = { paragraph: string; heading: string; topic: string };

let term = "";
let sentence = "";
let extra: Extra = { paragraph: "", heading: "", topic: "" };
let anchor = { left: 0, top: 0, bottom: 0 };
let requestId = 0;

// ---------- Helpers ----------
const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

// Grow the selection outward so it covers whole words.
function expandToWholeWords(range: Range): string {
  const start = range.startContainer;
  const end = range.endContainer;
  if (start.nodeType === Node.TEXT_NODE) {
    const text = start.textContent ?? "";
    let i = range.startOffset;
    while (i > 0 && WORD_CHAR.test(text[i - 1])) i--;
    range.setStart(start, i);
  }
  if (end.nodeType === Node.TEXT_NODE) {
    const text = end.textContent ?? "";
    let i = range.endOffset;
    while (i < text.length && WORD_CHAR.test(text[i])) i++;
    range.setEnd(end, i);
  }
  return range.toString().replace(/\s+/g, " ").trim();
}

// Find the sentence that contains the term.
function getSentence(range: Range, word: string): string {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const block = el?.closest("p, li, h1, h2, h3, h4, td, blockquote") ?? el;
  const full = (block?.textContent ?? "").replace(/\s+/g, " ");
  const at = full.indexOf(word);
  if (at === -1) return word;
  let s = at;
  while (s > 0 && !/[.!?]/.test(full[s - 1])) s--;
  let e = at + word.length;
  while (e < full.length && !/[.!?]/.test(full[e])) e++;
  return full.slice(s, Math.min(e + 1, full.length)).trim();
}

// Collect the paragraph, nearest heading, and conversation topic.
function getExtraContext(range: Range): Extra {
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

  const block = el?.closest("p, li, td, blockquote") ?? el;
  const paragraph = (block?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 600);

  const message =
    el?.closest("[data-message-author-role]") ?? el?.closest("article") ?? document.body;
  let heading = "";
  for (const h of Array.from(message.querySelectorAll("h1, h2, h3, h4"))) {
    if (el && h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      heading = (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    }
  }

  const firstUser = document.querySelector('[data-message-author-role="user"]');
  const topic = (firstUser?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

  return { paragraph, heading, topic };
}

function placeHost() {
  const width = card.hidden ? 80 : 320;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  host.style.left = `${left}px`;
  host.style.top = `${anchor.bottom + 8}px`;
  host.style.display = "block";
  // Not enough room below? Flip above the selection.
  const height = host.offsetHeight;
  if (anchor.bottom + 8 + height > window.innerHeight - 8) {
    host.style.top = `${Math.max(8, anchor.top - height - 8)}px`;
  }
}

function hideAll() {
  requestId++; // ignore any lookup still in flight
  host.style.display = "none";
  button.hidden = false;
  card.hidden = true;
}

function setState(state: "loading" | "done" | "error", text = "") {
  loadingEl.hidden = state !== "loading";
  bodyEl.hidden = state === "loading";
  bodyEl.className = state === "error" ? "body error" : "body";
  bodyEl.textContent = text;
  retryBtn.hidden = state !== "error";
  onStateChange(state);
}

function lookUp() {
  const id = ++requestId;
  setState("loading");
  chrome.runtime.sendMessage(
    { type: "define", term, sentence, ...extra },
    (reply) => {
      if (id !== requestId) return; // card was closed or replaced
      if (chrome.runtime.lastError || !reply?.ok) {
        setState("error", "Couldn't get a definition. Is the local server running?");
      } else {
        setState("done", reply.definition);
      }
      placeHost(); // the card changed height
    }
  );
}

function showButton() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
    hideAll();
    return;
  }
  const range = selection.getRangeAt(0);
  term = expandToWholeWords(range);
  if (!term || term.length > 60) {
    hideAll(); // Define is for words and short phrases
    return;
  }
  sentence = getSentence(range, term);
  extra = getExtraContext(range);
  const rect = range.getBoundingClientRect();
  anchor = { left: rect.left, top: rect.top, bottom: rect.bottom };
  requestId++;
  button.hidden = false;
  card.hidden = true;
  placeHost();
}

// ---------- Events ----------
document.addEventListener("mouseup", (e) => {
  if (e.composedPath().includes(host)) return;
  setTimeout(showButton, 0);
}, true);

document.addEventListener("mousedown", (e) => {
  if (!e.composedPath().includes(host)) hideAll();
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideAll();
}, true);

document.addEventListener("scroll", hideAll, true);

// Keep the page highlight when our buttons are pressed
for (const b of Array.from(shadow.querySelectorAll("button"))) {
  b.addEventListener("mousedown", (e) => e.preventDefault());
}

button.addEventListener("click", () => {
  termEl.textContent = term;
  contextEl.textContent = sentence ? `“${sentence}”` : "";
  button.hidden = true;
  card.hidden = false;
  placeHost();
  lookUp();
});

closeBtn.addEventListener("click", hideAll);
retryBtn.addEventListener("click", lookUp);

// ---------- Save to glossary ----------
type Entry = { term: string; definition: string; sentence: string; savedAt: number };

const glossaryStyle = document.createElement("style");
glossaryStyle.textContent = `
  .actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .save {
    font: 13px system-ui, sans-serif; color: #fff; background: #3b3b3b;
    border: 1px solid #555; border-radius: 8px; padding: 4px 10px; cursor: pointer;
  }
  .save:disabled { opacity: 0.65; cursor: default; }
  .view {
    font: 13px system-ui, sans-serif; color: #9a9a9a; background: none;
    border: none; text-decoration: underline; cursor: pointer; padding: 4px 2px;
  }
  .view:hover { color: #fff; }
`;
shadow.appendChild(glossaryStyle);

const actions = document.createElement("div");
actions.className = "actions";
actions.hidden = true;

const saveBtn = document.createElement("button");
saveBtn.type = "button";
saveBtn.className = "save";
saveBtn.textContent = "Save to glossary";

const viewBtn = document.createElement("button");
viewBtn.type = "button";
viewBtn.className = "view";
viewBtn.textContent = "View glossary";

actions.append(saveBtn, viewBtn);
card.insertBefore(actions, contextEl);

for (const b of [saveBtn, viewBtn]) {
  b.addEventListener("mousedown", (e) => e.preventDefault());
}

function getGlossary(cb: (list: Entry[]) => void) {
  chrome.storage.local.get("glossary", (data) => cb((data?.glossary as Entry[]) ?? []));
}

function onStateChange(state: "loading" | "done" | "error") {
  actions.hidden = state !== "done";
  if (state !== "done") return;
  saveBtn.textContent = "Save to glossary";
  saveBtn.disabled = false;
  getGlossary((list) => {
    if (list.some((e) => e.term.toLowerCase() === term.toLowerCase())) {
      saveBtn.textContent = "Saved ✓";
      saveBtn.disabled = true;
    }
  });
}

saveBtn.addEventListener("click", () => {
  const definition = bodyEl.textContent ?? "";
  getGlossary((list) => {
    const rest = list.filter((e) => e.term.toLowerCase() !== term.toLowerCase());
    rest.unshift({ term, definition, sentence, savedAt: Date.now() });
    chrome.storage.local.set({ glossary: rest }, () => {
      saveBtn.textContent = "Saved ✓";
      saveBtn.disabled = true;
    });
  });
});

viewBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open-glossary" });
});
