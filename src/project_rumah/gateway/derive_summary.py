"""
gateway/derive_summary.py — derive a short_content envelope from a cron message.

The cron bridge script may not yet send the structured short_content envelope.
This module builds one from the message content + blocks so the sticky "now"
card and push notifications always have a scannable summary.
"""

import json
import re
from typing import Any, Optional


def _extract_inline_blocks(text: str) -> list[dict[str, Any]]:
    """Extract [[block:type:{json}]] fences using bracket-depth scanning."""
    blocks: list[dict[str, Any]] = []
    opener = "[[block:"
    cursor = 0
    while cursor < len(text):
        start = text.find(opener, cursor)
        if start == -1:
            break
        type_start = start + len(opener)
        colon = text.find(":", type_start)
        if colon == -1:
            break
        block_type = text[type_start:colon].strip()
        body_start = colon + 1
        end = _find_fence_end(text, body_start)
        if end == -1:
            break
        body = text[body_start:end]
        try:
            data = json.loads(body)
            if isinstance(data, dict):
                blocks.append({"type": block_type, "data": data})
        except json.JSONDecodeError:
            pass
        cursor = end + 2
    return blocks


def _find_fence_end(text: str, body_start: int) -> int:
    """Find the index of the first `]` of the terminating `]]` outside JSON strings/nesting."""
    pos = body_start
    in_string = False
    escape = False
    depth = 0
    while pos < len(text):
        ch = text[pos]
        if escape:
            escape = False
            pos += 1
            continue
        if ch == "\\" and in_string:
            escape = True
            pos += 1
            continue
        if ch == '"':
            in_string = not in_string
            pos += 1
            continue
        if in_string:
            pos += 1
            continue
        if ch == "{" or ch == "[":
            depth += 1
            pos += 1
            continue
        if ch == "}" or ch == "]":
            if ch == "]" and pos + 1 < len(text) and text[pos + 1] == "]" and depth <= 0:
                return pos
            depth -= 1
            pos += 1
            continue
        pos += 1
    return -1


def _strip_prefixes(text: str) -> str:
    """Remove LLM instruction prefixes that are not user-visible content."""
    lines = text.splitlines()
    cleaned: list[str] = []
    skip = False
    for line in lines:
        if line.startswith("[REMINDER:"):
            skip = True
            continue
        if line.startswith("[UI BLOCK FORMAT]"):
            skip = True
            continue
        if skip and line.startswith("[END UI BLOCK FORMAT]"):
            skip = False
            continue
        if skip:
            continue
        if line == "[SILENT]":
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def _headline_from_blocks(blocks: list[dict[str, Any]], default: str = "Update") -> str:
    """Best headline: heading block text or current time-ish context."""
    for b in blocks:
        if b["type"] == "heading":
            text = str(b["data"].get("text") or b["data"].get("title") or "").strip()
            if text:
                return text[:80]
    for b in blocks:
        if b["type"] == "greeting":
            text = str(b["data"].get("text") or b["data"].get("title") or "").strip()
            if text:
                return text[:80]
    return default


def _primary_from_blocks(blocks: list[dict[str, Any]]) -> Optional[str]:
    """Most important single thing: one_thing text, then first countdown/deadline, then first event."""
    for b in blocks:
        if b["type"] == "one_thing":
            text = str(b["data"].get("text") or b["data"].get("title") or "").strip()
            if text:
                return text[:80]
    for b in blocks:
        if b["type"] == "countdown":
            label = str(b["data"].get("label") or "").strip()
            target = str(b["data"].get("target") or "").strip()
            if label and target:
                return f"{label} at {target}"[:80]
            if label:
                return label[:80]
    for b in blocks:
        if b["type"] == "deadline":
            name = str(b["data"].get("name") or "").strip()
            when = str(b["data"].get("when") or "").strip()
            if name and when:
                return f"{name} by {when}"[:80]
            if name:
                return name[:80]
    for b in blocks:
        if b["type"] in ("calendar_day", "calendar_row", "agenda"):
            events = b["data"].get("events") or []
            if events and isinstance(events, list):
                first = events[0]
                if isinstance(first, dict):
                    title = str(first.get("title") or "").strip()
                    time = str(first.get("time") or "").strip()
                    if title and time:
                        return f"{time} {title}"[:80]
                    if title:
                        return title[:80]
    return None


def _secondary_from_blocks(blocks: list[dict[str, Any]]) -> Optional[str]:
    """Next upcoming thing: second calendar event, next countdown, or next deadline."""
    for b in blocks:
        if b["type"] in ("calendar_day", "agenda"):
            events = b["data"].get("events") or []
            if isinstance(events, list) and len(events) > 1:
                ev = events[1]
                if isinstance(ev, dict):
                    title = str(ev.get("title") or "").strip()
                    time = str(ev.get("time") or "").strip()
                    if title and time:
                        return f"{time} {title}"[:80]
                    if title:
                        return title[:80]
    for b in blocks:
        if b["type"] == "countdown":
            label = str(b["data"].get("label") or "").strip()
            if label:
                return label[:80]
    for b in blocks:
        if b["type"] == "deadline":
            name = str(b["data"].get("name") or "").strip()
            if name:
                return name[:80]
    return None


def _status_from_blocks(blocks: list[dict[str, Any]]) -> Optional[str]:
    """Compact chips: habits progress, deadlines count, streak, energy."""
    chips: list[str] = []

    # checklist / habit progress
    total = 0
    done = 0
    for b in blocks:
        if b["type"] in ("checklist", "habit"):
            items = b["data"].get("items") or []
            if isinstance(items, list):
                total += len(items)
                done += sum(1 for it in items if isinstance(it, dict) and it.get("done"))
    if total > 0:
        chips.append(f"{done}/{total} habits")

    # deadline count
    deadlines = [b for b in blocks if b["type"] == "deadline"]
    if deadlines:
        chips.append(f"{len(deadlines)} deadline{'s' if len(deadlines) > 1 else ''}")

    # streak
    for b in blocks:
        if b["type"] == "streak":
            num = b["data"].get("num") or b["data"].get("value")
            label = str(b["data"].get("label") or "").strip()
            if num is not None:
                chips.append(f"streak {num}")
            elif label:
                chips.append(label[:30])
            break

    # energy
    for b in blocks:
        if b["type"] == "stat" and str(b["data"].get("label") or "").lower() == "energy":
            value = b["data"].get("value")
            if value is not None:
                chips.append(f"energy {value}")
            break

    if chips:
        return " · ".join(chips)[:80]
    return None


def _first_clean_line(text: str) -> Optional[str]:
    """Return the first non-empty, non-block, non-instruction line."""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("[[block:") or line.startswith("```"):
            continue
        if len(line) > 160:
            line = line[:157] + "..."
        return line
    return None


def derive_short_content(content: str, blocks: Optional[list[dict[str, Any]]] = None) -> dict[str, Any]:
    """Build a short_content envelope from raw cron message content."""
    cleaned = _strip_prefixes(content or "")
    parsed_blocks = blocks if blocks is not None else _extract_inline_blocks(cleaned)

    headline = _headline_from_blocks(parsed_blocks)
    # If no heading block, derive from first clean prose line.
    if headline == "Update":
        first_line = _first_clean_line(cleaned)
        if first_line:
            headline = first_line[:80]

    primary = _primary_from_blocks(parsed_blocks)
    secondary = _secondary_from_blocks(parsed_blocks)
    status = _status_from_blocks(parsed_blocks)

    # Fallback: if no primary/secondary/status, use prose.
    if not primary and not secondary:
        prose = _first_clean_line(cleaned)
        if prose and prose != headline:
            primary = prose[:80]

    summary: dict[str, Any] = {"headline": headline or "Update"}
    if primary:
        summary["primary"] = primary
    if secondary:
        summary["secondary"] = secondary
    if status:
        summary["status"] = status
    return summary


def looks_like_cron(body: dict[str, Any]) -> bool:
    """Heuristic: does this /api/session/message payload look like a cron tick?"""
    if body.get("source") == "cron":
        return True
    if body.get("title") == "Cron delivery":
        return True
    role = body.get("role", "")
    if role == "assistant" and not body.get("client_msg_id"):
        # Assistant messages without a client_msg_id are likely machine-generated.
        return True
    return False
