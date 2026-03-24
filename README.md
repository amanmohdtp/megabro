<p align="center">
  <img src="https://s6.imgcdn.dev/Yx1HLD.png" alt="Megabro logo" width="150"/>
</p>

<p align="center">
<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=40&pause=1000&color=FFFFFF&center=true&vCenter=true&width=435&lines=MEGABRO" alt="Typing SVG" />
</p>
<p align="center"><em>AI-powered command interface. Install once. Type megabro. Go.</em></p>

<p align="center">
  <img src="https://img.shields.io/npm/v/megabro?color=F5F8A4&labelColor=111&style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/license-MIT-F5F8A4?labelColor=111&style=flat-square" alt="license"/>
  <img src="https://img.shields.io/badge/node-%3E%3D14-F5F8A4?labelColor=111&style=flat-square" alt="node"/>
  <img src="https://img.shields.io/npm/dm/megabro?color=F5F8A4&labelColor=111&style=flat-square" alt="downloads"/>
  <img src="https://img.shields.io/github/stars/amanmohdtp/megabro?color=F5F8A4&labelColor=111&style=flat-square" alt="stars"/>

<a href="https://discord.gg/nazsuzQqXX">
  <img src="https://img.shields.io/badge/Community-Discord-f5f8a4?logo=discord&logocolor=111&labelcolor=111&style=flat-square" alt="discord"/>
</a>
</p>


<br/>

## What is Megabro?

Megabro is a local AI interface that connects to **Google Gemini** directly from your browser. No cloud dashboard, no account wall, no tracking. Just a clean terminal-style UI running on `localhost:3000`.

### Key Features

- **Instant Boot** : zero-config startup, launches your browser automatically
- **Live Chat** : send prompts, get intelligent AI responses in real time
- **Retro TV Interface** : beautiful CRT-style display with scanlines and glow effects
- **Session Stats** : live message count and token estimation
- **Export** : save your full conversation to a `.txt` file with one click
- **Model Picker** : switch between Gemini models on the fly
- **Privacy First** : your API key stays in `sessionStorage` only, never logged or stored on disk
- **Lightweight** : just Express + one HTML file, minimal footprint

<br/>

## Quick Start

### Install globally via npm

```bash
npm install -g megabro
```

### Run it

```bash
megabro
```

That is it. A progress bar boots, your browser opens, and you are ready to go.

<br/>

## Get a Free API Key

1. Go to [aistudio.google.com](https://aistudio.google.com/)
2. Click **Get API Key**
3. Copy the key (starts with `AIza...`)
4. Paste it into the Megabro boot screen

Your key is stored in `sessionStorage` only and is never sent anywhere except directly to Google's Gemini API through your own local server.

<br/>

## Screenshot

<p align="center">
  <img src="https://s6.imgcdn.dev/Yx1bxa.png" alt="Megabro screenshot" width="1000"/>
</p>

<br/>

## Tech Stack

| Layer | Technology |
|-------|------------|
| Server | Node.js + Express |
| Browser Launch | `open` package |
| Frontend | Vanilla HTML / CSS / JS |
| AI Backend | Google Gemini API |

<br/>

## Project Structure

```
megabro/
  bin/cli.js            # CLI entry point with animated boot sequence
  index.js              # Express server and Gemini API proxy
  public/index.html     # Single-file frontend (HTML + CSS + JS)
  package.json          # Package config and dependencies
  .github/workflows/    # Automated npm publish pipeline
```

<br/>

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |

```bash
PORT=8080 megabro
```

<br/>

## Available Models

| Model | Description |
|-------|-------------|
| `gemini-2.0-flash` | Latest fast model (default) |
| `gemini-1.5-flash` | Fast and efficient |
| `gemini-1.5-pro` | Most capable |

Switch models from the dropdown in the bottom bar of the interface.

<br/>

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a message to Gemini |
| `GET` | `/api/health` | Health check |

### POST /api/chat

```json
{
  "message": "Hello!",
  "apiKey": "AIza...",
  "model": "gemini-2.0-flash",
  "history": []
}
```

<br/>

## Troubleshooting

**Port already in use?**
Set a custom port: `PORT=8080 megabro`

**Browser does not open automatically?**
Navigate manually to `http://localhost:3000`

**API key not working?**
Make sure your key starts with `AIza` and is active at [aistudio.google.com](https://aistudio.google.com/)

**Getting rate limited?**
The free Gemini API has usage limits. Wait a moment and try again, or upgrade your API plan.

<br/>

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

<br/>

## License

[MIT](LICENSE) - Made with love by [Aman](https://github.com/amanmohdtp)
