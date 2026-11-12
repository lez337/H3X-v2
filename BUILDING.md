# Build and publish H3X Searcher

Use Windows with Node.js 22 or newer. From the project folder:

```powershell
npm ci
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File setup/Verify-Setup.ps1
npm run dist:win
```

The build checks TypeScript, builds the app, generates branding, packages the Windows x64 installer, compiles the setup launcher, and calculates SHA-256 checksums. The first build needs internet access for packaging tools.

Outputs in `release/`:

- `H3X-Setup.exe`: main setup download, with the current H3X icon and black-and-white window.
- `H3X-Setup-0.2.3.exe`: versioned copy of the same setup launcher.
- `H3X-Searcher-Setup-0.2.3-x64.exe`: full installer, also suitable for offline installation.
- `SHA256SUMS.txt`: checksums for all three executable files.

Versions follow `package.json`. The setup automatically downloads the latest published stable release from **lez337/H3X-v2**. It requires the matching full installer and `SHA256SUMS.txt`, validates their release URLs, checks the download size and SHA-256 hash, and installs silently within the setup flow. H3X stays closed afterward. Repair / Update uses the same verified download. Uninstall keeps saved workspace data.

To rebuild only the launcher, run `npm run setup:build`. The default repository comes from `releaseRepository` in `package.json`. An explicit `-Repository owner/name` argument to `setup/Build-Setup.ps1`, or `H3X_RELEASE_REPOSITORY` environment variable, overrides it. This does not change the installed app's default update source.

## Publish on GitHub

The workflow at `.github/workflows/release.yml` runs on pushes to `main`, or manually through Actions. It installs dependencies, runs app and setup checks, builds both installers, tests the bundled setup against the current GitHub release without installing it, and uploads build artifacts. It then creates a draft release, attaches all four output files, and publishes it as the latest stable release. Draft-first publication prevents setup from seeing an incomplete release.

For the next release:

```powershell
npm version patch --no-git-tag-version
```

Commit the changed source, `package.json` and `package-lock.json`, then push to `main`. Existing published versions are preserved; a new package version is required for a new release. The workflow tags the exact build commit. If a draft upload fails, rerunning the workflow completes that draft.

Share https://github.com/lez337/H3X-v2/releases/latest/download/H3X-Setup.exe with users. Do not put generated binaries, `node_modules`, personal settings, or credentials in the source repository. The setup and updater use public releases without a GitHub token. Binaries are unsigned.

## Automatic app updates

Installed Windows x64 builds use **lez337/H3X-v2** by default. Empty repository settings from older versions migrate to this default; custom repositories and disabled automatic checks are preserved. Manage these settings under **Keep H3X up to date**.

Automatic checks run 30 seconds after startup and every six hours. **Check for updates** runs immediately. Newer stable installers are downloaded and verified with SHA-256 before an update banner appears. **Install & close H3X** saves the workspace, launches silent installation, and closes H3X. Reopen the app yourself afterward.

The first version with this updater must be installed manually. Development builds do not install updates. Checksums detect damaged downloads; the GitHub release repository is the trusted source.

# Telegram account integration

Starting with `npm start` or `npm run dev`, and packaging with `npm run dist:win`, automatically download missing Telegram libraries. To install them separately:

```powershell
npm run telegram:install
```

This saves GramJS (`telegram`) and the local QR encoder (`qrcode`) as runtime dependencies and updates the npm lockfile. The installed app includes these libraries, so users do not need npm or a separate download.

In Search or Integrations, open **Telegram bots**. Obtain your API ID and API hash from https://my.telegram.org/apps and enter them. Select **QR code**, then **Show login QR code**. On your phone, open Telegram > Settings > Devices > Link Desktop Device, scan the QR code, and approve the login. Expired QR codes refresh automatically; the login window closes after five minutes. Enter your two-step verification password if requested. You can alternatively select **Phone code** to log in with your phone number and login code. Enter these in the app, not in chat. The session and API credentials are encrypted with Windows protected storage, outside the workspace JSON and exports.

Add a bot using its exact @username, select it, enter a message or use its query template, then click **Send to bot**. Only this action sends the message. Text replies refresh every three seconds for two minutes; use **Check replies again** for delayed responses. Media and interactive bot buttons must be handled in Telegram. Disconnect removes the saved local session and attempts to revoke the Telegram session; if offline, revoke it under Telegram Settings > Devices.


## Search providers and TXT files

Configure OathNet, BrixHub, Telegram, GHunt and WhatsMyName under Settings. Search contains the provider choices. GHunt uses the command `ghunt` from PATH unless an executable path is supplied; authenticate it separately with `ghunt login`. WhatsMyName checks GET-compatible public profile entries from the official dataset; it does not use a hosted WhatsMyName API and does not bypass anti-automation measures. Matching usernames do not establish identity.

Telegram provider queries use a selected public-username or domain bot category and its message template. Selecting Telegram and clicking Search sends that message. Replies can be saved automatically as TXT and opened from Settings > Telegram. A timeout means the message may still have been sent; check Telegram before retrying. Responses are collected until they stop changing for four seconds or the configured wait expires. Attachments and interactive bot buttons remain in Telegram.

TXT exports contain person details and notes, without internal evidence blocks or investigation metadata tags. Original evidence remains in the local workspace. Old structured TXT imports are still accepted. Multiple phone numbers, emails and usernames are deduplicated and joined with commas. Complete valid birth dates can supply an age as of import/loading time; partial birth years do not create an exact birth date or age. Settings > Files & exports accepts independent top and bottom text art for investigation exports, search exports and Telegram reply files.

The stealer browser uses OathNet's manifest endpoint to show a redacted folder tree; it never downloads file contents. It preserves generic artifact names, hides personal names and identifiers, and displays a redacted preview. It follows the manifest structure, not a verified pixel-for-pixel copy of the private OathNet website.

Local file search offers 19 field types. Names and usernames require explicit labels and plausible word structure; cookie, session, token and secret contexts are ignored. Scores are heuristic pattern-confidence values, not calibrated probabilities or identity verification. Use the minimum-confidence slider to filter results.
