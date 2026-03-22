# ⚡ MEGABRO
**Infrastructure-Grade Gemini Computer Use for Termux**

`megabro` is a professional-grade automation layer that connects Google's Gemini 2.0/2.5 Flash models directly to your Termux environment. It provides a headless VNC desktop and a clean, high-performance web interface to control your Android device via AI.

---

## 🛠️ Prerequisites

Before installing, ensure your Termux environment is ready:

```bash
pkg update && pkg upgrade -y
pkg install x11-repo -y
pkg install python nodejs-lts tigervnc fluxbox chromium xdotool git -y
pip install google-genai
npm install -g websockify
```

🚀 Installation
Install the package globally from your terminal:

```npm install -g megabro```

💻 Usage
Launch the entire stack with a single command:
```megabro```

 * Open your browser to http://localhost:3000.
 * Initialize with your Gemini API Key (Get one at Google AI Studio).
 * Watch the live Chromium stream and give instructions in the console.
✨ Features
 * Cyber-Industrial UI: Minimalist, dark-themed dashboard for high-focus work.
 * VNC over Web: Live screen recording streamed via noVNC to your local host.
 * Zero-Latency Execution: Direct bridge between AI outputs and xdotool shell commands.
 * State Persistence: API keys and session settings are stored securely in local storage.
📁 Architecture
 * Frontend: Tailwind CSS / Vanilla JS (SPA)
 * Backend: Node.js / Express
 * Automation: Google Gemini 2.0 Flash / X11 / xdotool
