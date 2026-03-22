# Contributing to Megabro

Thanks for your interest in contributing! Here is how you can help.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies with `npm install`
4. Run the dev server with `npm start`
5. Open `http://localhost:3000` in your browser

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/megabro.git
cd megabro
npm install
npm start
```

## How to Contribute

### Reporting Bugs

- Open an issue with a clear title
- Describe the bug and steps to reproduce
- Include your Node.js version and OS

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the feature and why it would be useful
- Include mockups or examples if possible

### Submitting Code

1. Create a new branch from `main`
2. Make your changes
3. Test your changes locally
4. Commit with clear, descriptive messages
5. Push to your fork and open a Pull Request

## Code Style

- Use `'use strict'` in all JS files
- Use `const` and `let` (never `var`)
- Keep functions small and focused
- Add comments for complex logic

## Project Structure

```
megabro/
  bin/cli.js          # CLI entry point (terminal UI + server boot)
  index.js            # Express server + Gemini API proxy
  public/index.html   # Frontend (single file: HTML + CSS + JS)
  package.json        # Package metadata and dependencies
  .github/workflows/  # CI/CD pipeline
```

## Testing

Run the test suite:

```bash
npm test
```

## Questions?

Open an issue and we will get back to you.
