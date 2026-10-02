const API_URL = "http://127.0.0.1:8000/define";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-glossary") {
    openGlossary(sender.tab?.id);
    return;
  }
  if (message?.type !== "define") return;

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return res.json();
    })
    .then((data) => sendResponse({ ok: true, definition: data.definition }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));

  return true; // keeps the channel open for the async reply
});

function openGlossary(fromTabId?: number) {
  const base = chrome.runtime.getURL("glossary.html");
  const url = fromTabId === undefined ? base : `${base}?from=${fromTabId}`;
  chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener((tab) => openGlossary(tab.id));
