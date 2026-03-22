<p align="center">
  <img src="https://s6.imgcdn.dev/Yx103M.png" alt="Megabro logo" width="100"/>
</p>

<h1 align="center">MEGABRO</h1>
<p align="center"><em>AI-powered command interface. Install once. Type megabro. Go.</em></p>

<p align="center">
  <img src="https://img.shields.io/npm/v/megabro?color=F5F8A4&labelColor=111&style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/license-MIT-F5F8A4?labelColor=111&style=flat-square" alt="license"/>
  <img src="https://img.shields.io/badge/node-%3E%3D14-F5F8A4?labelColor=111&style=flat-square" alt="node"/>
</p>

---

## Install

```bash
npm install -g megabro
```

## Use

```bash
megabro
```

That's it. A progress bar boots, your browser opens, and you're in.

---

## What it does

Megabro is a local AI interface that talks to **Google Gemini** directly from your browser — no cloud dashboard, no account wall, no tracking. Just a clean terminal-style UI on `localhost:3000`.

- **Instant boot** : minimal dependencies, sub-second startup
- **Live chat** : send commands, get smart AI responses
- **Session stats** : message count, token estimate, requests/min
- **Export** : save your session to a `.txt` file
- **Model picker** : switch between Gemini models on the fly

---

## Get a free API key

1. Go to [aistudio.google.com](https://aistudio.google.com/)
2. Click **Get API Key**
3. Copy the key (starts with `AIza...`)
4. Paste it into the Megabro boot screen

Your key is stored in `sessionStorage` only — never sent anywhere except directly to Google's API via your own server.

---

## Screenshot

> Dark terminal aesthetic, `#F5F8A4` accent, animated stats sidebar.

---

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js + Express |
| Browser open | `open` |
| Frontend | Vanilla HTML/CSS/JS |
| AI | Google Gemini API |

---

## License

MIT © Aman
