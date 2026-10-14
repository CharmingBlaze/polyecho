#!/usr/bin/env python3
"""Turn electron-builder output into portable and install zips, plus Linux and macOS builds.

Windows and Linux binaries come from electron-builder. macOS apps are assembled from
the official Electron darwin zip because electron-builder only packs Mac apps on macOS.
A Mac still has to ad-hoc sign the app once (Run PolyEcho.command / Install PolyEcho.command).
"""
from __future__ import annotations

import io
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release"
CACHE = RELEASE / ".cache"
ELECTRON_PKG = ROOT / "node_modules" / "electron" / "package.json"


def version() -> str:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]


def electron_version() -> str:
    return json.loads(ELECTRON_PKG.read_text(encoding="utf-8"))["version"]


def run_node(script: str, *args: str) -> str:
    proc = subprocess.run(
        ["node", str(ROOT / "scripts" / script), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode("utf-8", errors="replace"))
        raise SystemExit(f"node {script} failed ({proc.returncode})")
    return proc.stdout.decode("utf-8").strip()


def zip_store(src: Path, dest: Path, arcname: str, mode: int = 0o644) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    info = zipfile.ZipInfo(arcname)
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = (mode & 0xFFFF) << 16
    info.create_system = 3
    info.date_time = time.localtime(src.stat().st_mtime)[:6]
    with zipfile.ZipFile(dest, "w", allowZip64=True) as zf, src.open("rb") as raw:
        with zf.open(info, "w") as out:
            shutil.copyfileobj(raw, out, 1024 * 1024)


def is_final_zip(path: Path) -> bool:
    name = path.name
    return name.endswith("-portable.zip") or name.endswith("-install.zip")


def package_windows(ver: str) -> None:
    setup = next(RELEASE.glob(f"PolyEcho-{ver}-setup.exe"), None)
    if setup is None:
        setups = [p for p in RELEASE.glob("*-setup.exe")]
        setup = setups[0] if setups else None
    if setup is not None:
        dest = RELEASE / f"PolyEcho-{ver}-windows-install.zip"
        print(f"windows install zip <- {setup.name}")
        zip_store(setup, dest, setup.name, 0o644)
        setup.unlink()

    for zpath in list(RELEASE.glob("*.zip")):
        if is_final_zip(zpath):
            continue
        if "-linux-" in zpath.name or "-mac-" in zpath.name:
            continue
        dest = RELEASE / f"PolyEcho-{ver}-windows-portable.zip"
        print(f"windows portable zip <- {zpath.name}")
        if dest.exists():
            dest.unlink()
        zpath.rename(dest)


def linux_root() -> Path | None:
    found = sorted(RELEASE.glob("linux-unpacked*"))
    return found[0] if found else None


def is_elf(path: Path) -> bool:
    try:
        with path.open("rb") as raw:
            return raw.read(4) == b"\x7fELF"
    except OSError:
        return False


def add_tree(zf: zipfile.ZipFile, folder: Path, prefix: str) -> None:
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames.sort()
        rel_dir = Path(dirpath).relative_to(folder)
        for name in sorted(filenames):
            src = Path(dirpath) / name
            rel = (rel_dir / name).as_posix()
            arc = f"{prefix}/{rel}" if prefix else rel
            mode = 0o755 if is_elf(src) or name.endswith(".sh") else 0o644
            info = zipfile.ZipInfo(arc)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (mode & 0xFFFF) << 16
            info.create_system = 3
            info.date_time = time.localtime(src.stat().st_mtime)[:6]
            with src.open("rb") as raw, zf.open(info, "w") as out:
                shutil.copyfileobj(raw, out, 1024 * 1024)


def write_text_zip(zf: zipfile.ZipFile, arc: str, text: str, mode: int) -> None:
    data = text.replace("\r\n", "\n").encode("utf-8")
    info = zipfile.ZipInfo(arc)
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = (mode & 0xFFFF) << 16
    info.create_system = 3
    info.date_time = time.localtime()[:6]
    zf.writestr(info, data)


def package_linux(ver: str) -> None:
    folder = linux_root()
    if folder is None:
        print("linux unpacked app not found, skipping linux zips")
        return
    binary = folder / "polyecho"
    if not binary.exists():
        raise SystemExit(f"linux build is missing {binary}")
    launcher = """#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# A portable unzip is not installed as root, so chrome-sandbox cannot be made setuid.
exec "$ROOT/polyecho" --no-sandbox "$@"
"""
    portable = RELEASE / f"PolyEcho-{ver}-linux-x64-portable.zip"
    print(f"linux portable zip <- {folder.name}")
    with zipfile.ZipFile(portable, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        add_tree(zf, folder, "PolyEcho")
        write_text_zip(zf, "PolyEcho/Run PolyEcho.sh", launcher, 0o755)

    deb_name = f"polyecho_{ver}_amd64.deb"
    deb_path = RELEASE / ".cache" / deb_name
    deb_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"linux install deb <- {deb_name}")
    write_deb(folder, deb_path, ver)
    install = RELEASE / f"PolyEcho-{ver}-linux-x64-install.zip"
    with zipfile.ZipFile(install, "w", allowZip64=True) as zf:
        info = zipfile.ZipInfo(deb_name)
        info.compress_type = zipfile.ZIP_STORED
        info.external_attr = 0o644 << 16
        info.create_system = 3
        with deb_path.open("rb") as raw, zf.open(info, "w") as out:
            shutil.copyfileobj(raw, out, 1024 * 1024)
        write_text_zip(
            zf,
            "Install.txt",
            f"sudo apt install ./{deb_name}\n",
            0o644,
        )


def tar_bytes(members: list[tuple[str, bytes, int]]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, data, mode in members:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = mode
            info.mtime = int(time.time())
            info.uid = 0
            info.gid = 0
            tar.addfile(info, io.BytesIO(data))
    raw = buf.getvalue()
    import gzip

    return gzip.compress(raw, mtime=0)


def ar_header(name: str, size: int) -> bytes:
    name_b = f"{name}/".encode("ascii").ljust(16)
    header = b"".join([
        name_b,
        f"{int(time.time()):<12}".encode("ascii"),
        b"0     ",
        b"0     ",
        b"100644  ",
        f"{size:<10}".encode("ascii"),
        b"`\n",
    ])
    if len(header) != 60:
        raise SystemExit(f"ar header for {name} is {len(header)} bytes")
    return header


def write_deb(folder: Path, dest: Path, ver: str) -> None:
    control = (
        "Package: polyecho\n"
        f"Version: {ver}\n"
        "Section: graphics\n"
        "Priority: optional\n"
        "Architecture: amd64\n"
        "Maintainer: PolyEcho <dev@polyecho.app>\n"
        "Depends: libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, libxtst6, "
        "xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0, libasound2 | libasound2t64\n"
        "Description: Desktop low-poly 3D modeling, UV pixel painting, and skeletal animation\n"
        " PolyEcho desktop editor.\n"
    ).encode("utf-8")
    postinst = (
        "#!/bin/sh\n"
        "set -e\n"
        "if [ -f /opt/PolyEcho/chrome-sandbox ]; then\n"
        "  chown root:root /opt/PolyEcho/chrome-sandbox || true\n"
        "  chmod 4755 /opt/PolyEcho/chrome-sandbox || true\n"
        "fi\n"
        "exit 0\n"
    ).encode("utf-8")
    control_tar = tar_bytes([
        ("control", control, 0o644),
        ("postinst", postinst, 0o755),
    ])
    icon = (ROOT / "build" / "icon.png").read_bytes()
    data = tar_tree_plus(folder, icon)

    members = [
        ("debian-binary", b"2.0\n"),
        ("control.tar.gz", control_tar),
        ("data.tar.gz", data),
    ]
    with dest.open("wb") as out:
        out.write(b"!<arch>\n")
        for name, blob in members:
            out.write(ar_header(name, len(blob)))
            out.write(blob)
            if len(blob) % 2 == 1:
                out.write(b"\n")


def tar_tree_plus(folder: Path, icon: bytes) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for dirpath, dirnames, filenames in os.walk(folder):
            dirnames.sort()
            for name in sorted(filenames):
                src = Path(dirpath) / name
                rel = (Path(dirpath).relative_to(folder) / name).as_posix()
                info = tarfile.TarInfo(f"opt/PolyEcho/{rel}")
                info.size = src.stat().st_size
                info.mode = 0o755 if is_elf(src) else 0o644
                info.mtime = int(src.stat().st_mtime)
                info.uid = 0
                info.gid = 0
                with src.open("rb") as raw:
                    tar.addfile(info, raw)
        extras = [
            ("usr/bin/polyecho", b"#!/bin/sh\nexec /opt/PolyEcho/polyecho \"$@\"\n", 0o755),
            (
                "usr/share/applications/polyecho.desktop",
                (
                    "[Desktop Entry]\n"
                    "Name=PolyEcho\n"
                    "Comment=Low-poly 3D modeling\n"
                    "Exec=/usr/bin/polyecho %f\n"
                    "Icon=polyecho\n"
                    "Terminal=false\n"
                    "Type=Application\n"
                    "Categories=Graphics;\n"
                ).encode("utf-8"),
                0o644,
            ),
            ("usr/share/icons/hicolor/1024x1024/apps/polyecho.png", icon, 0o644),
        ]
        for name, data, mode in extras:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = mode
            info.mtime = int(time.time())
            info.uid = 0
            info.gid = 0
            tar.addfile(info, io.BytesIO(data))
    import gzip

    return gzip.compress(buf.getvalue(), mtime=0)


def package_mac_native(ver: str) -> bool:
    dmgs = [p for p in RELEASE.glob(f"PolyEcho-{ver}-mac-*.dmg")]
    zips = [
        p for p in RELEASE.glob(f"PolyEcho-{ver}-mac-*.zip")
        if not is_final_zip(p)
    ]
    if not dmgs and not zips:
        return False
    for zpath in zips:
        # PolyEcho-1.2.0-mac-arm64.zip -> PolyEcho-1.2.0-mac-arm64-portable.zip
        dest = zpath.with_name(zpath.stem + "-portable.zip")
        print(f"mac portable zip <- {zpath.name}")
        if dest.exists():
            dest.unlink()
        zpath.rename(dest)
    for dmg in dmgs:
        arch = dmg.stem.split("-mac-")[-1]
        dest = RELEASE / f"PolyEcho-{ver}-mac-{arch}-install.zip"
        print(f"mac install zip <- {dmg.name}")
        zip_store(dmg, dest, dmg.name, 0o644)
        dmg.unlink()
    return True


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"cached {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"download {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)


def icns_from_png(png: bytes) -> bytes:
    entry = b"ic10" + struct.pack(">I", 8 + len(png)) + png
    return b"icns" + struct.pack(">I", 8 + len(entry)) + entry


def copy_zipinfo(src: zipfile.ZipInfo, name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(filename=name, date_time=src.date_time)
    info.compress_type = src.compress_type
    info.external_attr = src.external_attr
    info.create_system = src.create_system or 3
    info.flag_bits = src.flag_bits
    info.extra = src.extra
    return info


RUN_COMMAND = """#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
xattr -cr "PolyEcho.app" || true
codesign --force --deep --sign - "PolyEcho.app"
open "PolyEcho.app"
"""

INSTALL_COMMAND = """#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
xattr -cr "PolyEcho.app" || true
codesign --force --deep --sign - "PolyEcho.app"
rm -rf "/Applications/PolyEcho.app"
cp -R "PolyEcho.app" "/Applications/PolyEcho.app"
open "/Applications/PolyEcho.app"
"""


def package_mac_hand(ver: str) -> None:
    asar = None
    for rel in ("win-unpacked/resources/app.asar", "linux-unpacked/resources/app.asar"):
        candidate = RELEASE / rel
        if candidate.exists():
            asar = candidate
            break
    if asar is None:
        raise SystemExit("app.asar not found; package Windows or Linux before the Mac app")
    print(f"mac asar hash <- {asar}")
    asar_hash = run_node("release_fuses.mjs", "hash", str(asar))
    png = (ROOT / "build" / "icon.png").read_bytes()
    icon = icns_from_png(png)
    ev = electron_version()
    for arch in ("arm64", "x64"):
        src_zip = CACHE / f"electron-v{ev}-darwin-{arch}.zip"
        url = f"https://github.com/electron/electron/releases/download/v{ev}/electron-v{ev}-darwin-{arch}.zip"
        download(url, src_zip)
        print(f"mac {arch} app")
        build_mac_app(src_zip, arch, ver, asar, asar_hash, icon)


def build_mac_app(src_zip: Path, arch: str, ver: str, asar: Path, asar_hash: str, icon: bytes) -> None:
    portable = RELEASE / f"PolyEcho-{ver}-mac-{arch}-portable.zip"
    install = RELEASE / f"PolyEcho-{ver}-mac-{arch}-install.zip"
    binary_tmp = CACHE / f"PolyEcho-darwin-{arch}"
    framework_name = (
        "Electron.app/Contents/Frameworks/Electron Framework.framework/"
        "Versions/A/Electron Framework"
    )
    with zipfile.ZipFile(src_zip, "r") as src:
        main_name = "Electron.app/Contents/MacOS/Electron"
        print(f"flip fuses in Electron Framework ({arch})")
        binary_tmp.write_bytes(src.read(framework_name))
        run_node("release_fuses.mjs", "flip", str(binary_tmp))
        fused = binary_tmp.read_bytes()
        plist = plistlib.loads(src.read("Electron.app/Contents/Info.plist"))
        plist["CFBundleExecutable"] = "PolyEcho"
        plist["CFBundleName"] = "PolyEcho"
        plist["CFBundleDisplayName"] = "PolyEcho"
        plist["CFBundleIdentifier"] = "com.polyecho.app"
        plist["CFBundleIconFile"] = "icon"
        plist["CFBundleShortVersionString"] = ver
        plist["CFBundleVersion"] = ver
        plist["ElectronAsarIntegrity"] = {
            "Resources/app.asar": {"algorithm": "SHA256", "hash": asar_hash}
        }
        plist["CFBundleDocumentTypes"] = [{
            "CFBundleTypeExtensions": ["psxproj"],
            "CFBundleTypeName": "PolyEcho Project",
            "CFBundleTypeRole": "Editor",
            "LSHandlerRank": "Owner",
        }]
        plist_bytes = plistlib.dumps(plist, fmt=plistlib.FMT_XML)

        def write_both(out_portable: zipfile.ZipFile, out_install: zipfile.ZipFile) -> None:
            for info in src.infolist():
                name = info.filename
                if name.startswith("__MACOSX") or name.endswith("/.DS_Store"):
                    continue
                renamed = name.replace("Electron.app/", "PolyEcho.app/", 1) if name.startswith("Electron.app/") else name
                if name == "Electron.app/Contents/Resources/default_app.asar":
                    continue
                if name == main_name:
                    renamed = "PolyEcho.app/Contents/MacOS/PolyEcho"
                    data = src.read(info)
                    out_portable.writestr(copy_zipinfo(info, renamed), data)
                    out_install.writestr(copy_zipinfo(info, renamed), data)
                    continue
                if name == framework_name:
                    renamed = name.replace("Electron.app/", "PolyEcho.app/", 1)
                    out_portable.writestr(copy_zipinfo(info, renamed), fused)
                    out_install.writestr(copy_zipinfo(info, renamed), fused)
                    continue
                if name == "Electron.app/Contents/Info.plist":
                    out_info = copy_zipinfo(info, renamed)
                    out_info.compress_type = zipfile.ZIP_DEFLATED
                    out_info.file_size = len(plist_bytes)
                    out_portable.writestr(out_info, plist_bytes)
                    out_install.writestr(copy_zipinfo(info, renamed), plist_bytes)
                    continue
                data = src.read(info)
                out_portable.writestr(copy_zipinfo(info, renamed), data)
                out_install.writestr(copy_zipinfo(info, renamed), data)
            asar_info = zipfile.ZipInfo("PolyEcho.app/Contents/Resources/app.asar")
            asar_info.compress_type = zipfile.ZIP_STORED
            asar_info.external_attr = 0o644 << 16
            asar_info.create_system = 3
            with asar.open("rb") as raw:
                blob = raw.read()
            out_portable.writestr(asar_info, blob)
            out_install.writestr(asar_info, blob)
            icon_info = zipfile.ZipInfo("PolyEcho.app/Contents/Resources/icon.icns")
            icon_info.compress_type = zipfile.ZIP_STORED
            icon_info.external_attr = 0o644 << 16
            icon_info.create_system = 3
            out_portable.writestr(icon_info, icon)
            out_install.writestr(icon_info, icon)
            write_text_zip(out_portable, "Run PolyEcho.command", RUN_COMMAND, 0o755)
            write_text_zip(out_install, "Install PolyEcho.command", INSTALL_COMMAND, 0o755)

        with zipfile.ZipFile(portable, "w", allowZip64=True) as out_p, zipfile.ZipFile(install, "w", allowZip64=True) as out_i:
            write_both(out_p, out_i)
    print(f"wrote {portable.name} and {install.name}")


def main() -> None:
    ver = version()
    RELEASE.mkdir(parents=True, exist_ok=True)
    package_windows(ver)
    package_linux(ver)
    if not package_mac_native(ver):
        package_mac_hand(ver)
    print("release zips:")
    for path in sorted(RELEASE.glob("PolyEcho-*.zip")):
        print(f"  {path.name}  {path.stat().st_size}")


if __name__ == "__main__":
    main()
