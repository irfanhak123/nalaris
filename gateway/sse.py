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
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)


def format_sse(event_type: str, data: dict) -> str:
    """Format a single SSE event as a string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def stream_from_queue(
    queue: asyncio.Queue[Optional[dict]],
) -> AsyncGenerator[str, None]:
    """
    Async generator that reads events from a queue and yields SSE-formatted strings.

    Stops when it receives None (sentinel) or the stream is cancelled.
    """
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120.0)
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
