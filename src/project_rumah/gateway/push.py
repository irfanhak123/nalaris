"""
push.py — Web Push sender for Nalaris.

Uses pywebpush to deliver encrypted push messages to subscribed Android
(and other) devices whenever the server wants to notify the single user.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from pywebpush import WebPushException, webpush

from . import push_keys

logger = logging.getLogger("gateway.push")


def _vapid_claims(subject: Optional[str] = None) -> dict:
    """Build VAPID claims for a single push."""
    sub = subject or os.environ.get("RUMAH_VAPID_SUBJECT", "mailto:nalaris@localhost")
    return {"sub": sub}


def _extract_body_from_content(content: Any) -> str:
    """Build a short notification body from a cron/assistant message.

    Prefer a structured short_content envelope when the caller already
    passed it; otherwise strip block fences and return the first clean line.
    """
    if isinstance(content, dict):
        parts = [v for k, v in [
            ("primary", content.get("primary")),
            ("secondary", content.get("secondary")),
            ("status", content.get("status")),
        ] if v]
        if parts:
            body = " · ".join(parts)
            return body[:157] + "..." if len(body) > 160 else body
        content = content.get("headline") or content.get("text") or ""
    if not isinstance(content, str):
        content = str(content) if content else ""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    cleaned = []
    for line in lines:
        if line.startswith("[[block:") or line.startswith("[REMINDER:"):
            continue
        cleaned.append(line)
    if not cleaned:
        return "New update from Nalaris"
    body = cleaned[0]
    if len(body) > 160:
        body = body[:157] + "..."
    return body


def _extract_title_from_content(content: Any, default: str = "Nalaris") -> str:
    """Derive a notification title from the message content or envelope."""
    if isinstance(content, dict):
        headline = content.get("headline")
        if headline:
            return headline[:77] + "..." if len(headline) > 80 else headline
        content = content.get("text") or ""
    if not isinstance(content, str):
        content = str(content) if content else ""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    for line in lines:
        if line.startswith("[[block:") or line.startswith("[REMINDER:"):
            continue
        if len(line) <= 80:
            return line
        return line[:77] + "..."
    return default


def send_push(
    store: Any,
    title: str,
    body: str,
    data: Optional[dict] = None,
    user_id: Optional[str] = None,
) -> dict:
    """Send a Web Push notification to every subscription for the user.

    Returns a summary dict with counts: {sent, failed, removed}.
    """
    summary = {"sent": 0, "failed": 0, "removed": 0, "total": 0}
    if store is None:
        return summary

    target_user = user_id or "me"
    # Ensure VAPID keys exist before trying to send.
    push_keys.get_keys()
    subscriptions = store.get_push_subscriptions(target_user)
    if not subscriptions:
        return summary

    payload = json.dumps({
        "title": title,
        "body": body,
        "data": data or {},
    })
    vapid_claims = _vapid_claims()

    for sub in subscriptions:
        summary["total"] += 1
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {
                        "p256dh": sub["p256dh"],
                        "auth": sub["auth"],
                    },
                },
                data=payload,
                vapid_private_key=str(push_keys.vapid_key_path()),
                vapid_claims=vapid_claims,
                ttl=60 * 60,  # 1 hour
            )
            summary["sent"] += 1
            logger.debug("Push sent to %s", sub["endpoint"])
        except WebPushException as e:
            summary["failed"] += 1
            logger.warning("Push failed for %s: %s", sub["endpoint"], e)
            # Remove expired/invalid subscriptions so we don't retry forever.
            response = getattr(e, "response", None)
            status = getattr(response, "status_code", None) if response else None
            if status in (404, 410):
                try:
                    store.delete_push_subscription(sub["endpoint"])
                    summary["removed"] += 1
                    logger.info("Removed expired push subscription %s", sub["endpoint"])
                except Exception:
                    pass
        except Exception as e:
            summary["failed"] += 1
            logger.warning("Unexpected push error for %s: %s", sub["endpoint"], e)

    return summary


def send_push_for_cron_message(
    store: Any,
    content: Any,
    session_id: str,
    user_id: Optional[str] = None,
    explicit_title: Optional[str] = None,
    explicit_body: Optional[str] = None,
    short_content: Optional[dict] = None,
) -> dict:
    """Convenience helper called from the cron message endpoint."""
    if short_content is not None:
        content = short_content
    title = explicit_title or _extract_title_from_content(content)
    body = explicit_body or _extract_body_from_content(content)
    data = {"session_id": session_id, "link": "/"}
    return send_push(store, title, body, data=data, user_id=user_id)
