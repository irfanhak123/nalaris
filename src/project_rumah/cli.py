"""
cli.py — Command-line interface for Nalaris (Project Rumah).

Usage:
    nalaris-app serve              Start the app (gateway + panel)
    nalaris-app serve --port 9000  Custom port
    nalaris-app config             Show current config
    nalaris-app config set KEY VAL Set a config value
    nalaris-app config get KEY     Get a config value
    nalaris-app doctor             Check if everything is set up correctly
    nalaris-app build-panel        Build the panel and copy static files
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Default config file location
_CONFIG_FILE = Path.home() / ".nalaris" / "config.json"

_DEFAULT_CONFIG = {
    "model": "mimo-v2.5-pro",
    "provider": "xiaomi",
    "base_url": "",
    "port": 8790,
    "host": "0.0.0.0",
    "workspace": str(Path.home() / "workspace"),
    "profile": "default",
}


def _load_config() -> dict:
    """Load config from file, merging with defaults."""
    config = dict(_DEFAULT_CONFIG)
    if _CONFIG_FILE.exists():
        try:
            with open(_CONFIG_FILE) as f:
                stored = json.load(f)
            config.update(stored)
        except (json.JSONDecodeError, OSError):
            pass
    # Env vars override config file
    env_map = {
        "RUMAH_MODEL": "model",
        "RUMAH_PROVIDER": "provider",
        "RUMAH_BASE_URL": "base_url",
        "RUMAH_PORT": "port",
        "RUMAH_HOST": "host",
        "RUMAH_WORKSPACE": "workspace",
    }
    for env_key, config_key in env_map.items():
        val = os.environ.get(env_key)
        if val:
            if config_key == "port":
                config[config_key] = int(val)
            else:
                config[config_key] = val
    return config


def _save_config(config: dict) -> None:
    """Save config to file."""
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    print(f"Config saved to {_CONFIG_FILE}")


def _apply_config_to_env(config: dict) -> None:
    """Export config values as env vars so the gateway picks them up."""
    mapping = {
        "model": "RUMAH_MODEL",
        "provider": "RUMAH_PROVIDER",
        "base_url": "RUMAH_BASE_URL",
        "workspace": "RUMAH_WORKSPACE",
    }
    for key, env_var in mapping.items():
        val = config.get(key, "")
        if val and not os.environ.get(env_var):
            os.environ[env_var] = str(val)


def _load_hermes_env() -> None:
    """Load Hermes .env file if present."""
    try:
        from .gateway import paths
        env_file = paths.hermes_env_file()
        if env_file:
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, val = line.partition("=")
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and not os.environ.get(key):
                        os.environ[key] = val
    except Exception:
        pass


def _hermes_venv_python() -> Path | None:
    """Return the Python interpreter inside the Hermes venv, if it exists."""
    try:
        from .gateway import paths
        root = paths.hermes_root()
        candidate = root / "venv" / "bin" / "python"
        if candidate.exists():
            return candidate
        candidate = root / "venv" / "Scripts" / "python.exe"
        if candidate.exists():
            return candidate
    except Exception:
        pass
    return None


def _running_in_hermes_venv() -> bool:
    """Best-effort check that the current interpreter is the Hermes venv."""
    venv_python = _hermes_venv_python()
    if not venv_python:
        return False
    return Path(sys.executable).resolve() == venv_python.resolve()


def _check_core_runtime_deps() -> list[tuple[str, bool, str]]:
    """Lightweight check for the Hermes transitive deps Nalaris needs.

    Does *not* import run_agent itself — that is heavy and slow. Used during
    `serve` startup so the app still launches quickly.
    """
    checks: list[tuple[str, bool, str]] = []
    for mod in ("openai", "dotenv"):
        try:
            __import__(mod)
            checks.append((f"{mod} package", True, "importable"))
        except ImportError as e:
            checks.append((f"{mod} package", False, str(e)))
    return checks


def _check_runtime_deps() -> list[tuple[str, bool, str]]:
    """Full check that Hermes and its core transitive dependencies are importable.

    Used by `doctor`; slower because it imports run_agent.
    """
    checks: list[tuple[str, bool, str]] = []
    checks.extend(_check_core_runtime_deps())

    try:
        from .gateway import paths
        root = paths.hermes_root()
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
    except Exception as e:
        checks.append(("Hermes Agent path", False, str(e)))
        return checks

    try:
        import run_agent  # noqa: F401
        checks.append(("Hermes run_agent", True, "importable"))
    except Exception as e:
        checks.append(("Hermes run_agent", False, str(e)))

    return checks


# -- Commands --

def cmd_serve(args: argparse.Namespace) -> None:
    """Start the Nalaris app (gateway + panel on one port)."""
    config = _load_config()
    _load_hermes_env()
    _apply_config_to_env(config)

    port = args.port or config.get("port", 8790)
    host = args.host or config.get("host", "0.0.0.0")

    # Check if hermes-agent is findable
    try:
        from .gateway import paths
        root = paths.hermes_root()
        print(f"Hermes Agent: {root}")
    except FileNotFoundError as e:
        print(f"WARNING: {e}")
        print("The app will start but chat features will fail.\n")

    # Check that we are running from the Hermes venv (or can import its deps)
    if not _running_in_hermes_venv():
        venv_python = _hermes_venv_python()
        if venv_python:
            print("WARNING: You are not running from the Hermes Agent virtual environment.")
            print(f"  Current interpreter: {sys.executable}")
            print(f"  Hermes venv python:  {venv_python}")
            print("  Chat will fail unless Hermes and its dependencies (openai, dotenv, ...) are importable.")
            print(f"  Recommended: {venv_python} -m project_rumah.cli serve\n")
        else:
            print("WARNING: Hermes Agent venv not found. Chat may fail if dependencies are missing.\n")
    else:
        print("Hermes venv:  active")

    dep_checks = _check_core_runtime_deps()
    for name, ok, detail in dep_checks:
        if not ok:
            print(f"WARNING: {name}: {detail}")
    if any(not ok for _, ok, _ in dep_checks):
        print()

    # Check static dir
    from .gateway import paths
    static = paths.static_dir()
    if static.exists() and any(static.iterdir()):
        print(f"Panel files:  {static}")
    else:
        print(f"Panel files:  NOT FOUND at {static}")
        print("  The app will start but the UI won't load.")
        print("  Build the panel first or run: nalaris-app build-panel\n")

    print(f"Data dir:     {paths.data_dir()}")
    print(f"Starting on   http://{host}:{port}")
    print()

    from .gateway.server import run_server
    run_server(host=host, port=port)


def cmd_push_keys(args: argparse.Namespace) -> None:
    """Show or generate the VAPID public key for Web Push subscriptions."""
    from .gateway import push_keys

    keys = push_keys.get_keys()
    print("VAPID public key (paste into the panel / service worker setup):")
    print(keys.public_key_b64url())
    print(f"Private key stored at: {push_keys.vapid_key_path()}")


def cmd_kill(args: argparse.Namespace) -> None:
    """Kill any running Nalaris gateway process."""
    import signal
    killed = False
    for pid_str in os.listdir("/proc"):
        if not pid_str.isdigit():
            continue
        try:
            with open(f"/proc/{pid_str}/cmdline", "rb") as f:
                cmdline = f.read().replace(b"\x00", b" ").decode(errors="ignore")
        except OSError:
            continue
        if "gateway.server" not in cmdline and "nalaris-app serve" not in cmdline:
            continue
        try:
            exe = os.readlink(f"/proc/{pid_str}/exe")
        except OSError:
            exe = ""
        print(f"Killing PID {pid_str}: {cmdline.strip()}")
        try:
            os.kill(int(pid_str), signal.SIGTERM)
            killed = True
        except ProcessLookupError:
            pass
        except PermissionError:
            print(f"  Permission denied for PID {pid_str} ({exe})")
    if not killed:
        print("No running Nalaris gateway found.")
    if not killed:
        print("No running Nalaris gateway found.")
    else:
        print("Sent stop signal to running gateway(s).")


def cmd_config(args: argparse.Namespace) -> None:
    """Show or modify config."""
    config = _load_config()

    if args.config_action == "show" or not args.config_action:
        print(f"Config file: {_CONFIG_FILE}\n")
        for k, v in sorted(config.items()):
            print(f"  {k}: {v}")

    elif args.config_action == "set":
        if not args.key:
            print("Usage: nalaris-app config set KEY VALUE")
            sys.exit(1)
        val = " ".join(args.value) if args.value else ""
        if args.key == "port":
            val = int(val)
        config[args.key] = val
        _save_config(config)
        print(f"  {args.key} = {val}")

    elif args.config_action == "get":
        if not args.key:
            print("Usage: nalaris-app config get KEY")
            sys.exit(1)
        val = config.get(args.key)
        if val is not None:
            print(val)
        else:
            print(f"Key '{args.key}' not set")


def cmd_doctor(args: argparse.Namespace) -> None:
    """Check if everything is set up correctly."""
    from .gateway import paths

    print("Nalaris Doctor\n")

    checks = []

    # 1. Hermes Agent
    try:
        root = paths.hermes_root()
        checks.append(("Hermes Agent", True, str(root)))
    except FileNotFoundError as e:
        checks.append(("Hermes Agent", False, str(e)))

    # 2. Hermes .env
    env_file = paths.hermes_env_file()
    if env_file:
        checks.append(("Hermes .env", True, str(env_file)))
    else:
        checks.append(("Hermes .env", False, "Not found (optional)"))

    # 3. Panel static files
    static = paths.static_dir()
    if static.exists() and any(static.iterdir()):
        index = static / "index.html"
        if index.exists():
            checks.append(("Panel UI", True, str(static)))
        else:
            checks.append(("Panel UI", False, f"index.html missing in {static}"))
    else:
        checks.append(("Panel UI", False, f"No files in {static}"))

    # 4. Data directory
    data = paths.data_dir()
    if data.exists():
        checks.append(("Data dir", True, str(data)))
    else:
        checks.append(("Data dir", False, f"Cannot create {data}"))

    # 5. Config
    if _CONFIG_FILE.exists():
        checks.append(("Config", True, str(_CONFIG_FILE)))
    else:
        checks.append(("Config", True, "Using defaults (no config file yet)"))

    # 6. Hermes venv / runtime deps
    if _running_in_hermes_venv():
        checks.append(("Hermes venv", True, "active"))
    else:
        venv_python = _hermes_venv_python()
        if venv_python:
            checks.append(("Hermes venv", False, f"Not active; use {venv_python}"))
        else:
            checks.append(("Hermes venv", False, "Not found"))

    checks.extend(_check_runtime_deps())

    # Print results
    all_ok = True
    for name, ok, detail in checks:
        mark = "v" if ok else "x"
        print(f"  [{mark}] {name}: {detail}")
        if not ok:
            all_ok = False

    print()
    if all_ok:
        print("All checks passed. Run: nalaris-app serve")
    else:
        print("Some checks failed. Fix the issues above, then run: nalaris-app serve")


def cmd_build_panel(args: argparse.Namespace) -> None:
    """Build the panel and copy static files into the package."""
    import subprocess

    repo_root = Path(__file__).resolve().parent.parent.parent
    panel_dir = repo_root / "panel"

    if not panel_dir.exists():
        alt = Path.home() / "workspace" / "panel-v2"
        if alt.exists():
            panel_dir = alt
        else:
            print(f"Panel source not found at {panel_dir} or {alt}")
            sys.exit(1)

    print(f"Building panel from {panel_dir}...")

    # npm install
    print("  npm install...")
    result = subprocess.run(["npm", "install"], cwd=panel_dir, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  npm install failed:\n{result.stderr}")
        sys.exit(1)

    # npm run build
    print("  npm run build...")
    result = subprocess.run(["npm", "run", "build"], cwd=panel_dir, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Build failed:\n{result.stderr}")
        sys.exit(1)

    # Copy dist/ to package static/
    dist_dir = panel_dir / "dist"
    if not dist_dir.exists():
        print(f"  Build output not found at {dist_dir}")
        sys.exit(1)

    static_target = Path(__file__).resolve().parent / "static"
    static_target.mkdir(parents=True, exist_ok=True)

    import shutil
    for item in static_target.iterdir():
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()

    shutil.copytree(dist_dir, static_target, dirs_exist_ok=True)
    print(f"  Copied to {static_target}")
    print("Done. Run: nalaris-app serve")


# -- Main --

def main():
    parser = argparse.ArgumentParser(
        prog="nalaris-app",
        description="Nalaris — Personal assistant built on Hermes Agent",
    )
    sub = parser.add_subparsers(dest="command")

    # serve
    serve_p = sub.add_parser("serve", help="Start the app (gateway + panel)")
    serve_p.add_argument("--port", type=int, default=0, help="Port (default: from config or 8790)")
    serve_p.add_argument("--host", default="", help="Host (default: from config or 0.0.0.0)")

    # config
    config_p = sub.add_parser("config", help="Show or modify config")
    config_p.add_argument("config_action", nargs="?", default="show", choices=["show", "set", "get"])
    config_p.add_argument("key", nargs="?", default="")
    config_p.add_argument("value", nargs="*")

    # doctor
    sub.add_parser("doctor", help="Check if everything is set up correctly")

    # build-panel
    sub.add_parser("build-panel", help="Build the panel and copy static files")

    # kill
    sub.add_parser("kill", help="Stop any running Nalaris gateway")

    # push-keys
    sub.add_parser("push-keys", help="Show the VAPID public key for Web Push")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    commands = {
        "serve": cmd_serve,
        "config": cmd_config,
        "doctor": cmd_doctor,
        "build-panel": cmd_build_panel,
        "kill": cmd_kill,
        "push-keys": cmd_push_keys,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
