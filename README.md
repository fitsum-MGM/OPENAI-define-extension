# Define on Highlight

A browser extension that adds a **Define** button to text selection on chatgpt.com. Highlight a word, click **Define**, and a small card appears right under it with a short definition that fits the conversation you're reading. No new message, no side chat, and you never lose your place.

> **Status:** working prototype, built to demonstrate the idea. Not affiliated with or endorsed by OpenAI.

## The problem

When you're reading a long ChatGPT answer, you often hit a word or concept you don't know. Today the options are:

- ask ChatGPT, which adds a message to the conversation and moves you away from where you were reading, or
- open another tab and search.

Both break your reading flow for something that needs a two-sentence answer.

## What it does

- **Define in place.** Highlight a word or short phrase, click **Define**, and read a one- or two-sentence definition in a small card under the word. Press `Esc`, click ×, or click elsewhere to dismiss it.
- **Context-aware.** The definition uses the sentence, paragraph, nearest section heading, and the topic of the conversation. "Primary" in a database discussion is defined as a primary key, not "first".
- **Whole words.** If you highlight half a word, the selection grows to cover the whole word.
- **Personal glossary.** Click **Save to glossary** to keep a term. A glossary page lists saved terms with search and delete, and its × button takes you back to your chat.
- **Friendly failures.** Loading dots while waiting, and a **Try again** button if the request fails. The card flips above the word when there's no room below.

## Demo

[Add your demo video link here]

## How it differs from "Ask ChatGPT"

| | Ask ChatGPT | Define on Highlight |
|---|---|---|
| Where the answer appears | In the conversation, as a new message | In a small card next to the word |
| Effect on the conversation | Adds messages | None |
| Length | Whatever the model writes | At most two short sentences |
| Reuse | Scroll back through the chat | Saved terms in a searchable glossary |

## How it works

```
chatgpt.com page          extension background        local backend          language model
┌──────────────┐  term,   ┌──────────────────┐  POST  ┌──────────────┐       ┌────────────┐
│ content.ts   │─context─▶│ background.ts    │───────▶│ FastAPI      │──────▶│ any OpenAI-│
│ Define card  │◀─────────│ relays requests  │◀───────│ /define      │◀──────│ compatible │
└──────────────┘ definition└──────────────────┘        └──────────────┘       │ API        │
                                                                              └────────────┘
```

- **Extension (TypeScript).** A content script reads the selection and its surrounding context and draws the card inside a shadow root, so the page's styles can't affect it. A background script relays the request to the backend.
- **Backend (Python, FastAPI).** Builds a prompt from the term and context, calls a language model through the OpenAI-compatible API, and caches answers. The API key lives here and never in the browser.
- **Glossary.** Saved terms are stored in the browser's extension storage on your own machine.

The backend talks to any OpenAI-compatible endpoint. The defaults point to Google's Gemini API (which has a free tier), and you can switch to another provider by changing environment variables.

## Getting started

### Requirements

- Firefox (the version tested)
- Node.js and npm
- Python 3 with `venv`
- An API key for an OpenAI-compatible provider

### 1. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn openai

read -rs LLM_API_KEY      # paste your key, press Enter (nothing is shown)
export LLM_API_KEY
export LLM_MODEL="your-model-name"   # choose a small, fast model
uvicorn main:app --port 8000
```

### 2. Build and load the extension

```bash
npm install
npm run build
```

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and choose `dist/manifest.json`.
3. Open `about:addons`, select the extension, and under **Permissions** allow access to `chatgpt.com` and `127.0.0.1`.
4. Open chatgpt.com, highlight a word, and click **Define**.

Temporary add-ons are removed when Firefox closes, so repeat step 2 after a restart.

### Configuration

| Variable | Purpose | Default |
|---|---|---|
| `LLM_API_KEY` | API key for the provider (required) | none |
| `LLM_MODEL` | Model name to use | `gemini-3.5-flash-lite` |
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `https://generativelanguage.googleapis.com/v1beta/openai/` |

Model names change often. List the models your key can use and pick a small one.

## Privacy

When you click **Define**, the extension sends the selected term, its sentence, its paragraph, the nearest heading, and the first message of the conversation to your backend, which forwards them to the model provider you configured. Nothing is sent until you click. Your glossary stays in your browser's local extension storage. Check your provider's data-use terms, since some free tiers may use submitted content to improve their products, and avoid using the prototype on private conversations.

## Current limitations

- Tested in Firefox only. Chrome would need a small manifest change for its background worker.
- The backend runs on your own machine, so other people can't use the extension without running it too.
- Context collection relies on the current structure of the ChatGPT page and may need updating when that page changes.
- No automated tests yet.

## Ideas for what's next

- Native placement beside the existing selection popup
- A hosted backend with rate limiting
- Chrome support
- Glossary export and per-conversation glossaries
- A setting to hide the button or turn off context sharing

## License

[Choose a license and add a LICENSE file, for example MIT, or state "All rights reserved".]

## Author

Built by Fitsum. [Add an email address or profile link.]
