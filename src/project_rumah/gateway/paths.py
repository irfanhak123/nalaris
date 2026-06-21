"""
paths.py — Centralized path resolution for Project Rumah.

Every path that was previously hardcoded lives here.
Override any path with environment variables.
"""

import os
from pathlib import Path


def data_dir() -> Path:
    """
    Where the app stores its data (SQLite DB, session files, etc).
    Default: ~/.nalaris/data/
    Override: RUMAH_DATA_DIR env var.
    """
    env_val = os.environ.get("RUMAH_DATA_DIR", "").strip()
    if env_val:
        p = Path(env_val)
    else:
        p = Path.home() / ".nalaris" / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    """SQLite database path."""
    return data_dir() / "gateway.db"


def panel_session_file() -> Path:
    """File where the panel writes its session ID for cron bridge."""
    return data_dir() / "panel-session-id"


def static_dir() -> Path:
    """
    Where the bundled panel-v2 static assets live.
    Checks, in order:
      1. RUMAH_STATIC_DIR env var
      2. <package>/static/ (bundled at build time)
      3. <repo>/panel/dist/ (dev mode — panel built locally)
    """
    override = os.environ.get("RUMAH_STATIC_DIR", "")
    if override:
        p = Path(override)
        if p.exists():
            return p

    # Bundled with the package
    pkg_static = Path(__file__).resolve().parent.parent / "static"
    if pkg_static.exists() and any(pkg_static.iterdir()):
        return pkg_static

    # Dev fallback: panel/dist/ relative to the repo root
    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    dev_dist = repo_root / "panel" / "dist"
    if dev_dist.exists():
        return dev_dist

    # Another dev fallback: workspace panel-v2/dist/
    workspace_dist = Path.home() / "workspace" / "panel-v2" / "dist"
    if workspace_dist.exists():
        return workspace_dist

    return pkg_static  # may not exist yet — caller handles missing


def hermes_root() -> Path:
    """
    Find the hermes-agent installation.
    Checks, in order:
      1. RUMAH_HERMES_ROOT env var
      2. ~/.hermes/hermes-agent/
      3. HERMES_HOME env var + /hermes-agent/
    Raises FileNotFoundError if not found.
    """
    candidates = []

    override = os.environ.get("RUMAH_HERMES_ROOT", "")
    if override:
        candidates.append(Path(override))

    candidates.append(Path.home() / ".hermes" / "hermes-agent")

    hermes_home = os.environ.get("HERMES_HOME", "")
    if hermes_home:
        candidates.append(Path(hermes_home) / "hermes-agent")

    for p in candidates:
        if p.exists() and (p / "run_agent.py").exists():
            return p

    raise FileNotFoundError(
        "Hermes Agent not found. Searched:\n"
        + "\n".join(f"  - {c}" for c in candidates)
        + "\nInstall Hermes Agent first: https://hermes-agent.nousresearch.com/docs"
    )


def hermes_env_file() -> Path | None:
    """Path to the Hermes .env file, if it exists."""
    for candidate in [
        Path.home() / ".hermes" / ".env",
        hermes_root().parent / ".env",
    ]:
        if candidate.exists():
            return candidate
    return None
