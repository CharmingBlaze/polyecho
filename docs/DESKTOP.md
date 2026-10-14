# Desktop app

PolyEcho is a windowed Electron app. The Vue editor is unchanged; Chromium is the WebGL host.

## Commands

```bash
npm run dev        # Vite on :5180 + Electron window
npm run dev:web    # Browser-only (CI / quick layout checks)
npm run build      # Renderer production assets (`dist/`)
npm run dist         # Windows portable + install zips, Linux zips, and Mac zips (`release/`)
npm run dist:mac     # on macOS: native dmg + zip, then the same zip names
npm run handoff:glb  # write samples/engine-handoff.glb for DCC import
npm run icon         # write build/icon.ico + public/icon.ico from the favicon raster
```

`window.polyechoDesktop` is injected by `electron/preload.cjs`. Save, Save As, Open, Import, and Export use native dialogs when that object exists. In `dev:web` they fall back to `<input type="file">` and browser downloads.

The renderer (Vue, Three.js, Pinia) is bundled into `dist/` by Vite. Those packages are `devDependencies` so the installer does not pack a second copy of `node_modules`. Main-process code is only `electron/` (Node + Electron APIs). Packaged sessions set a Content-Security-Policy. Overwrite-save (`writeFile`) is limited to paths already chosen in a Save/Open dialog, recent files, or a launch argv path. Close is confirmed in the renderer; Cancel/`writeFile` failure abort the quit. If the renderer is hung, the window still closes after 8 seconds.

`electron-builder` uses `build/icon.ico` (PNG-in-ICO from the favicon crystal). `npm run icon` regenerates it. Window chrome loads `public/icon.ico` (copied into `dist/` on build). If `release/win-unpacked` is locked (running app, Defender), packaging fails with `EPERM` on rename; close PolyEcho and delete `release/`, or pass `--config.directories.output` to a writable folder.

## itch.io and antivirus

Trend Micro’s `ti!` plus a short hash (the label in [this itch.io thread](https://itch.io/t/3905211/file-being-detected-as-malware)) is a reputation hit on an unsigned exe, not a virus family in the source. Unsigned Electron builds trip it because the stock `electron.exe` is widely reused as a dropper, and a 7-Zip self-extractor looks like one.

`npm run dist` writes two Windows zips and does not leave a loose setup exe: `PolyEcho-<version>-windows-portable.zip` (unzip and run `PolyEcho.exe`) and `PolyEcho-<version>-windows-install.zip` (the NSIS setup). Upload those zips to itch.io. The setup is still unsigned and can get a fresh `ti!` label until it is signed.

The same command writes `PolyEcho-<version>-linux-x64-portable.zip` (run `Run PolyEcho.sh`) and `PolyEcho-<version>-linux-x64-install.zip` (`sudo apt install` the `.deb` inside). It also writes Mac arm64 and x64 portable and install zips. electron-builder cannot assemble a Mac app on Windows, so those zips are built from the official Electron darwin build plus this app's `app.asar`. On the Mac, double-click `Run PolyEcho.command` or `Install PolyEcho.command` once so the bundle is ad-hoc signed; Gatekeeper still requires Open on first launch for an unsigned download. On a Mac, `npm run dist:mac` uses electron-builder's native dmg and zip instead.

The packaged binary has Electron fuses flipped: `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `--inspect` are off, and the app loads only from `app.asar` with an embedded integrity hash. The page still loads with `loadFile` (`file://`), so the file-protocol fuse stays on.

Authenticode is what clears SmartScreen and that `ti!` hash on the next upload. With a `.pfx` in the environment, `npm run dist` signs the exe and the installer:

```powershell
$env:CSC_LINK = "C:\path\to\codesign.pfx"
$env:CSC_KEY_PASSWORD = "<password>"
npm run dist
```

Until a certificate is available, submit the exact zip/exe as a false positive to the vendor that quarantined it (Trend Micro’s submission form, or Microsoft for Defender). A new unsigned build gets a new hash, so a whitelist of the previous file does not cover the next one.

While packaging, Windows Defender sometimes quarantines files inside `%LOCALAPPDATA%\electron-builder\Cache` (`winCodeSign`). If that happens, the exe is left as the stock Electron binary and is more likely to match an existing detection. Exclude that cache folder, delete it, and pack again.

CI builds unpacked desktop packages on native Windows, Linux, and macOS runners (`--win dir`, `--linux dir`, `--mac dir`). A package is accepted only when a non-empty `app.asar` exists under `release/`. This is a packaging smoke check, not a renderer interaction test; use the manual production flow in `docs/PRODUCTION.md` for UI verification.

The first `npm run dev` downloads the Electron Chromium binary (can take a few minutes). If the window never appears, run `npx electron .` after Vite is up on port 5180 and read the error.

## Layout

| Path | Role |
| :--- | :--- |
| `electron/main.mjs` | Window, close confirm, bounds, recent files, last folder, single-instance, crash.log |
| `electron/preload.cjs` | Isolated bridge |
| `src/core/desktop/desktopApi.ts` | Renderer API + last `.psxproj` path |
| `src/core/project/projectIo.ts` | Ctrl+S / File → Save |
