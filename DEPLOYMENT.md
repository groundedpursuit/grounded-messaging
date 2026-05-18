# Apps Script Deployment

This repo keeps the Gemini API key out of source control and out of the Android app. GitHub Actions reads the key from an encrypted secret, writes it to Apps Script Script Properties, and deploys the Apps Script web app.

## Required GitHub Setup

Create a GitHub Environment named `production` for this repository. Add required reviewers to that environment before using the deploy workflow.

Add these environment secrets to `production`:

- `GEMINI_API_KEY`: the Gemini API key.
- `GAS_SCRIPT_ID`: the Google Apps Script project ID.
- `GAS_DEPLOYMENT_ID`: the existing Apps Script web app deployment ID.
- `CLASPRC_JSON`: the contents of the clasp credentials file from `~/.clasprc.json`.

The workflow keeps redeploying the current Apps Script web app deployment:

```text
AKfycbx1XGb3k8fu2xjnvYDIC0ovHELOrUeo2P8M4gV7v6zXdrgu9AFvZa0pvKXKFaf3liazvg
```

## Deployment Flow

The workflow runs on pushes to `main` that change Apps Script files, and it can also be run manually from GitHub Actions.

During deployment, GitHub Actions:

1. Installs `@google/clasp`.
2. Writes `CLASPRC_JSON` to the runner only.
3. Generates `.clasp.json` from `GAS_SCRIPT_ID` in a temporary deploy folder.
4. Pushes the Apps Script source, excluding browser-only JavaScript such as `sw.js`.
5. Runs `setGeminiApiKeyFromCi` to store `GEMINI_API_KEY` in Script Properties.
6. Redeploys the existing web app deployment.

Do not commit `.clasp.json`, `.clasprc.json`, API keys, or generated deploy folders.
