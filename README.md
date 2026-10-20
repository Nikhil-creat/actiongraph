# ActionGraph

Agentic AI that turns meeting transcripts into decisions, action items, owners, deadlines and risks.
Built by Nikhil Chary Sriramoju. Static site, no build step.

## Features
- 3-agent pipeline: Extractor (Groq) -> Critic (Gemini) -> Planner (Groq), with JSON self-correction and provider failover
- Paste any Groq (`gsk_`) or Gemini (`AIza`) key: provider is detected and the best available model is chosen automatically
- AI assistant grounded in the transcript, with line citations
- Offline rule engine that works with no key
- Keys are stored only in your browser (localStorage) and sent only to Groq or Google

## Free keys
- Groq: https://console.groq.com/keys
- Gemini: https://aistudio.google.com/apikey

## Deploy on GitHub Pages (from Termux on your phone)
```bash
pkg install git unzip -y
cd ~/storage/downloads          # run termux-setup-storage once if this folder is missing
unzip actiongraph.zip && cd actiongraph
git config --global user.name "Nikhil Chary Sriramoju"
git config --global user.email "sriramojunikhil66@gmail.com"
git init && git add . && git commit -m "ActionGraph: initial release"
git branch -M main
git remote add origin https://github.com/Nikhil-creat/actiongraph.git
git push -u origin main
```
1. First create an empty public repo named `actiongraph` at https://github.com/new (no README).
2. When Git asks for a password, paste a Personal Access Token (GitHub > Settings > Developer settings > Tokens, scope: `repo`).
3. In the repo: Settings > Pages > Source: "Deploy from a branch" > Branch `main`, folder `/ (root)` > Save.
4. After about a minute the site is live at https://nikhil-creat.github.io/actiongraph/

## Fastest way: GitHub CLI
```bash
pkg install gh -y
gh auth login          # choose GitHub.com, HTTPS, login with a web browser or token
bash deploy.sh         # creates the repo, pushes, and turns on Pages
```

## Update later
```bash
git add . && git commit -m "Update" && git push
```

## Extras
Install as an app (PWA), light/dark toggle, upload .txt/.vtt, export CSV/JSON, history of past runs.

## Use it
Open the site, tap "Connect AI", paste a key, then tap "Run agent pipeline". Add both keys to get cross-model verification.

## Security note
Because this is a static site, a key pasted into the page lives in that browser. Never commit a key into the code. For a public product, put the keys behind a small backend proxy.
