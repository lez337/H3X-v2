# H3X Searcher V2

Download **[H3X-Setup.exe](https://github.com/lez337/H3X-v2/releases/latest/download/H3X-Setup.exe)** from the latest release for Windows x64.

The black-and-white setup automatically uses **lez337/H3X-v2**. Install and Repair / Update download the latest stable installer, check its SHA-256 checksum and size, and install within the same setup flow. H3X stays closed after installation. Uninstall keeps your saved workspace and settings. Use the full `H3X-Searcher-Setup-VERSION-x64.exe` release attachment for offline installation.

## Development and builds

Use Windows and Node.js 22 or newer:

```powershell
npm ci
npm run dev
```

```powershell
npm test
powershell -NoProfile -File setup/Verify-Setup.ps1
npm run dist:win
```

All setup files and `SHA256SUMS.txt` are generated under `release/`. See [BUILDING.md](BUILDING.md) for publishing and update details.

## Releases and updates

Pushes to `main` run tests, build the Windows app and setup, verify a GitHub download, and publish a stable release when the package version has no published release yet. Increase the version with `npm version patch --no-git-tag-version` before publishing the next version. Existing published installers are preserved.

The installed app checks **lez337/H3X-v2** for updates by default. Manage automatic checks in Settings. Installing an update saves the workspace, closes H3X, and leaves it closed. No GitHub token is embedded. Binaries are unsigned.

## Workspace

Configure providers under Settings. OathNet requires your own API key. Optional GHunt commands require separate installation and authentication. Telegram account credentials and API credentials use Windows protected storage; they are kept outside the workspace JSON and exports. Search results and local field confidence scores require review before use.

Workspace records, logs, settings and exports stay in the local app data directory. Map tiles need internet and WebGL. The OathNet file tree exposes redacted manifest metadata and does not download stealer file contents.
