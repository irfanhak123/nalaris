"""
gateway/sse.py — Server-Sent Events formatter.

Matches the exact SSE protocol panel-v2's parseSse() expects:
  event: <type>
  data: <json>

  (blank line between events)
"""

import asyncio
import json
import logging
import queue as _queue
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)


def format_sse(event_type: str, data: dict) -> str:
    """Format a single SSE event as a string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def stream_from_queue(
    q: "_queue.Queue[Optional[dict]]",
) -> AsyncGenerator[str, None]:
    """
    Async generator that drains a thread-safe queue.Queue and yields
    SSE-formatted strings.

    The agent pushes events from a background thread; we consume them here on
    the SSE request's asyncio loop. Blocking ``q.get()`` is run in the default
    executor so it doesn't block the loop, and ``queue.Queue`` is thread-safe
    so cross-thread puts correctly wake the getter (unlike ``asyncio.Queue``).

    Stops when it receives None (sentinel) or the stream is cancelled.
    """
    loop = asyncio.get_running_loop()
    try:
        while True:
            try:
                event = await asyncio.wait_for(
                    loop.run_in_executor(None, q.get), timeout=120.0
                )
            except asyncio.TimeoutError:
                # Send keepalive comment
                yield ": keepalive\n\n"
                continue

            if event is None:
                break

            event_type = event.get("type", "unknown")
            event_data = event.get("data", {})
            yield format_sse(event_type, event_data)

    except asyncio.CancelledError:
        logger.debug("SSE stream cancelled")
    except Exception as e:
        logger.exception("SSE stream error")
        yield format_sse("error", {"error": str(e)})
