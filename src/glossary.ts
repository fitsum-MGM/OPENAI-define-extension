type Entry = { term: string; definition: string; sentence: string; savedAt: number };

const listEl = document.getElementById("list") as HTMLUListElement;
const countEl = document.getElementById("count") as HTMLParagraphElement;
const searchEl = document.getElementById("search") as HTMLInputElement;

let entries: Entry[] = [];

function load() {
  chrome.storage.local.get("glossary", (data) => {
    entries = (data?.glossary as Entry[]) ?? [];
    render();
  });
}

function remove(term: string) {
  const next = entries.filter((e) => e.term.toLowerCase() !== term.toLowerCase());
  chrome.storage.local.set({ glossary: next }, load);
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const shown = entries.filter(
    (e) => !q || e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)
  );
  listEl.textContent = "";
  countEl.textContent =
    entries.length === 0
      ? "Nothing saved yet. Highlight a word on ChatGPT, click Define, then Save to glossary."
      : `${shown.length} of ${entries.length} terms`;

  for (const e of shown) {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("h2");
    title.textContent = e.term;
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => remove(e.term));
    head.append(title, del);

    const def = document.createElement("p");
    def.className = "def";
    def.textContent = e.definition;
    li.append(head, def);

    if (e.sentence) {
      const ctx = document.createElement("p");
      ctx.className = "ctx";
      ctx.textContent = `“${e.sentence}”`;
      li.append(ctx);
    }

    const date = document.createElement("p");
    date.className = "date";
    date.textContent = new Date(e.savedAt).toLocaleDateString();
    li.append(date);

    listEl.append(li);
  }
}

searchEl.addEventListener("input", render);
chrome.storage.onChanged.addListener(() => load());
load();

function closeGlossary() {
  const from = Number(new URLSearchParams(location.search).get("from"));
  const closeSelf = () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id !== undefined) chrome.tabs.remove(tab.id);
      else window.close();
    });
  };
  if (from) {
    // Go back to the ChatGPT tab you came from, then close this one
    chrome.tabs.update(from, { active: true }, () => {
      void chrome.runtime.lastError; // the original tab may be gone; ignore
      closeSelf();
    });
  } else {
    closeSelf();
  }
}

document.getElementById("close")?.addEventListener("click", closeGlossary);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.activeElement !== searchEl) closeGlossary();
});
