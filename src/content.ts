console.log("[Define] content script loaded (v3)");

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
    }
    .term { font-weight: 600; margin-bottom: 6px; }
    .body { color: #cfcfcf; }
    .context {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #444;
      font-size: 12px;
      color: #9a9a9a;
    }
  </style>
  <button class="define" type="button">Define</button>
  <div class="card" hidden>
    <div class="term"></div>
    <div class="body"></div>
    <div class="context"></div>
  </div>
`;
document.body.appendChild(host);

const button = shadow.querySelector<HTMLButtonElement>("button.define")!;
const card = shadow.querySelector<HTMLDivElement>(".card")!;
const termEl = shadow.querySelector<HTMLDivElement>(".term")!;
const bodyEl = shadow.querySelector<HTMLDivElement>(".body")!;
const contextEl = shadow.querySelector<HTMLDivElement>(".context")!;

// ---------- State ----------
let term = "";
let sentence = "";
let anchor = { left: 0, bottom: 0 };

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

function placeHost() {
  const width = card.hidden ? 80 : 320;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  host.style.left = `${left}px`;
  host.style.top = `${anchor.bottom + 8}px`;
  host.style.display = "block";
}

function hideAll() {
  host.style.display = "none";
  button.hidden = false;
  card.hidden = true;
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
  const rect = range.getBoundingClientRect();
  anchor = { left: rect.left, bottom: rect.bottom };
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

// Keep the highlight from disappearing when the button is pressed
button.addEventListener("mousedown", (e) => e.preventDefault());

button.addEventListener("click", () => {
  console.log("[Define] term:", term, "| sentence:", sentence);
  termEl.textContent = term;
  bodyEl.textContent = "Looking up…";
  lookUp(term, sentence);
  contextEl.textContent = `Context: "${sentence}"`;
  button.hidden = true;
  card.hidden = false;
  placeHost();
});

let requestId = 0;

function lookUp(word: string, context: string) {
  const id = ++requestId;
  chrome.runtime.sendMessage({ type: "define", term: word, sentence: context }, (reply) => {
    if (id !== requestId) return; // a newer lookup replaced this one
    if (chrome.runtime.lastError || !reply?.ok) {
      bodyEl.textContent = "Couldn't get a definition. Is the local server running?";
      return;
    }
    bodyEl.textContent = reply.definition;
  });
}
