# Desktop app

PolyEcho is a windowed Electron app. The Vue editor is unchanged; Chromium is the WebGL host.

## Commands

```bash
npm run dev        # Vite on :5180 + Electron window
npm run dev:web    # Browser-only (CI / quick layout checks)
npm run build      # Renderer production assets (`dist/`)
npm run dist         # `dist/` + electron-builder installer (`release/`)
npm run handoff:glb  # write samples/engine-handoff.glb for DCC import
npm run icon         # write build/icon.ico + public/icon.ico from the favicon raster
```

`window.polyechoDesktop` is injected by `electron/preload.cjs`. Save, Save As, Open, Import, and Export use native dialogs when that object exists. In `dev:web` they fall back to `<input type="file">` and browser downloads.

The renderer (Vue, Three.js, Pinia) is bundled into `dist/` by Vite. Those packages are `devDependencies` so the installer does not pack a second copy of `node_modules`. Main-process code is only `electron/` (Node + Electron APIs). Packaged sessions set a Content-Security-Policy. Overwrite-save (`writeFile`) is limited to paths already chosen in a Save/Open dialog, recent files, or a launch argv path. Close is confirmed in the renderer; Cancel/`writeFile` failure abort the quit. If the renderer is hung, the window still closes after 8 seconds.

`electron-builder` uses `build/icon.ico` (PNG-in-ICO from the favicon crystal). `npm run icon` regenerates it. Window chrome loads `public/icon.ico` (copied into `dist/` on build). If `release/win-unpacked` is locked (running app, Defender), packaging fails with `EPERM` on rename; close PolyEcho and delete `release/`, or pass `--config.directories.output` to a writable folder.

The first `npm run dev` downloads the Electron Chromium binary (can take a few minutes). If the window never appears, run `npx electron .` after Vite is up on port 5180 and read the error.

## Layout

| Path | Role |
| :--- | :--- |
| `electron/main.mjs` | Window, close confirm, bounds, recent files, last folder, single-instance, crash.log |
| `electron/preload.cjs` | Isolated bridge |
| `src/core/desktop/desktopApi.ts` | Renderer API + last `.psxproj` path |
| `src/core/project/projectIo.ts` | Ctrl+S / File → Save |
