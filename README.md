# H3X Searcher V2

Download **H3X-Setup.exe** from [the latest release](https://github.com/lez337/H3X-v2/releases/latest). Setup downloads and checks the current Windows x64 installer. Install and Repair / Update launch that installer; Uninstall opens the installed app's uninstaller. The complete installer can also be run offline.

## Development

Node.js 22 or newer on Windows. Run `npm install`, then `node node_modules/electron/install.js` if installation scripts were blocked, then `npm run dev`.

## Build

Run `npm run dist:win`, followed by `powershell -NoProfile -File setup/build.ps1`. Outputs are in `release/`. No Node.js installation is needed to use the packaged app.

## Search

Select several provider checkboxes, enter a query, confirm authorization, and click Search. Providers run concurrently; each provider shows its own result count or error. Search within results filters the combined redacted cards.

OathNet requires your own API key in Settings. BrixHub currently uses its documented temporary public API with no key. GitHub public profile lookup takes a username; RDAP takes a domain or IP. Unsupported query types and provider failures appear separately. API contracts were reviewed November 8, 2026; live keyed searches have not been verified with an account.

Telegram entries copy a query and open the bot for manual interaction. WhatsMyName opens the external search site. GHunt requires an installed executable and prior authentication; SpiderFoot requires its separately running local interface. These are optional tool connections, not bundled search engines.

Case records, graph links, map pins, shortcuts and settings are stored locally in the app data directory. API credentials use Electron safeStorage on Windows. Map tiles need internet access and WebGL support. Case TXT exports contain the notes you enter. Results are masked before reaching the renderer; masking is not a substitute for reviewing exports.

## GitHub releases

The release workflow builds Windows x64 setup on pushes to main. It publishes a release only when the package version has no existing release tag. Increase package.json and package-lock.json versions for a new release. Assets: H3X-Setup.exe, H3X-Searcher-Setup-VERSION-x64.exe, SHA256SUMS.txt.

Setup always uses public releases from **lez337/H3X-v2**. No GitHub token is embedded in the app. Binaries are unsigned.
