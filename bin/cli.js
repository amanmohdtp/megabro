#!/usr/bin/env node
const shell = require('shelljs');
const path = require('path');

console.log("🚀 Initializing Megabro Infrastructure...");

// 1. Setup VNC and Window Manager
shell.exec("vncserver -kill :1 > /dev/null 2>&1");
shell.exec("vncserver :1 -geometry 1280x720");
shell.exec("DISPLAY=:1 fluxbox &", {async: true});
shell.exec("DISPLAY=:1 chromium --no-sandbox &", {async: true});

// 2. Start noVNC Proxy (Assuming noVNC is in user home)
shell.exec("websockify 8080 localhost:5901 --web ~/noVNC &", {async: true});

// 3. Start the Megabro Server
require('../index.js');
