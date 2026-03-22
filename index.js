const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Gemini Action Bridge
app.post('/execute', (req, res) => {
    const { prompt, api_key } = req.body;
    
    // Python bridge for Gemini API (reusing your server logic)
    const pythonCmd = `python3 -c "
import google.genai as genai
client = genai.Client(api_key='${api_key}')
resp = client.models.generate_content(model='gemini-2.0-flash', contents='Output ONLY xdotool command for: ${prompt}')
print(resp.text.strip())"`;

    exec(pythonCmd, (error, stdout) => {
        const xCommand = stdout.trim().replace(/`/g, "");
        exec(`DISPLAY=:1 ${xCommand}`);
        res.json({ status: 'success', executed: xCommand });
    });
});

app.listen(3000, () => {
    console.log("✅ Megabro UI active at http://localhost:3000");
});
