#!/usr/bin/env python3
"""
Panel-v2 Block Syntax Verifier
===============================
Validates [[block:<type>:<json>]] fences against the panel's block registry.

Usage:
  python verify-blocks.py <file>          # verify blocks in a file
  python verify-blocks.py -               # read from stdin
  echo '[[block:stat:{"label":"X","value":"1"}]]' | python verify-blocks.py -
  python verify-blocks.py --schema <type> # print expected schema for a block type
  python verify-blocks.py --types         # list all registered block types
  python verify-blocks.py --fix <file>    # attempt auto-fix (escape ]], quote keys)

Exit codes: 0 = all valid, 1 = errors found, 2 = usage error
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from typing import Any

# ─── Block type registry ─────────────────────────────────────────────────────
# Derived from panel-v2/src/components/blocks/index.tsx + component interfaces.

BLOCK_TYPES: dict[str, dict[str, Any]] = {
    "greeting": {
        "required": ["text"],
        "optional": ["sub"],
    },
    "stat": {
        "required": ["label", "value"],
        "optional": ["sub"],
    },
    "one_thing": {
        "required": [],
        "optional": ["text"],
    },
    "proactive_question": {
        "required": [],
        "optional": ["lbl", "q", "actions"],
        "nested": {
            "actions": {
                "item_fields": {
                    "required": ["id", "label", "kind"],
                    "optional": ["payload", "primary"],
                }
            }
        },
    },
    "question": {
        "required": ["text", "urgency"],
        "optional": ["actions"],
        "nested": {
            "actions": {
                "item_fields": {
                    "required": ["id", "label"],
                    "optional": ["primary"],
                }
            }
        },
    },
    "calendar_day": {
        "required": [],
        "optional": ["date", "weekday", "day_name", "events"],
        "nested": {
            "events": {
                "item_fields": {
                    "required": [],
                    "optional": ["time", "title", "duration", "working", "location", "end", "note"],
                }
            }
        },
    },
    "calendar_row": {
        "required": ["time", "title"],
        "optional": [],
    },
    "calendar_down": {
        "required": ["note"],
        "optional": [],
    },
    "agenda": {
        "required": [],
        "optional": ["days"],
        "nested": {
            "days": {
                "item_fields": {
                    "required": [],
                    "optional": ["h", "events"],
                },
                "sub_nested": {
                    "events": {
                        "item_fields": {
                            "required": [],
                            "optional": ["title", "when"],
                        }
                    }
                },
            }
        },
    },
    "timeline": {
        "required": [],
        "optional": ["events"],
        "nested": {
            "events": {
                "item_fields": {
                    "required": [],
                    "optional": ["t", "l", "passed"],
                }
            }
        },
    },
    "countdown": {
        "required": [],
        "optional": ["label", "time", "sub", "urgency"],
        "enums": {"urgency": ["high", "med", "low"]},
    },
    "deadline": {
        "required": ["name"],
        "optional": ["raw_date"],
    },
    "callout": {
        "required": [],
        "optional": ["variant", "tone", "severity", "title", "body"],
        "enums": {
            "variant": ["info", "warning", "success", "danger"],
            "tone": ["info", "warning", "success", "danger"],
            "severity": ["info", "warning", "success", "danger"],
        },
    },
    "table": {
        "required": [],
        "optional": ["headers", "rows"],
    },
    "columns": {
        "required": [],
        "optional": ["items", "cols"],
        "enums": {"cols": [2, 3]},
    },
    "tabs": {
        "required": [],
        "optional": ["tabs", "active", "panels"],
        "nested": {
            "tabs": {
                "item_fields": {
                    "required": ["id", "label"],
                    "optional": [],
                }
            }
        },
    },
    "heading": {
        "required": [],
        "optional": ["level", "text"],
        "ranges": {"level": (1, 5)},
    },
    "confirm": {
        "required": ["confirm"],
        "optional": ["q", "ctx", "cancel"],
        "nested": {
            "confirm": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload", "label"],
                }
            },
            "cancel": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload", "label"],
                }
            },
        },
    },
    "button_row": {
        "required": [],
        "optional": ["actions"],
        "nested": {
            "actions": {
                "item_fields": {
                    "required": ["id", "label", "kind"],
                    "optional": ["payload", "primary", "danger", "disabled", "ghost"],
                }
            }
        },
    },
    "quick_replies": {
        "required": [],
        "optional": ["chips"],
        "nested": {
            "chips": {
                "item_fields": {
                    "required": ["id", "label", "kind"],
                    "optional": ["payload"],
                }
            }
        },
    },
    "picker": {
        "required": [],
        "optional": ["label", "options", "selected", "action"],
        "nested": {
            "options": {
                "item_fields": {
                    "required": ["id", "label"],
                    "optional": [],
                }
            },
            "action": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload"],
                }
            },
        },
    },
    "slider": {
        "required": [],
        "optional": ["label", "min", "max", "value", "unit", "action", "action_label"],
        "nested": {
            "action": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload"],
                }
            },
        },
    },
    "image": {
        "required": [],
        "optional": ["src", "caption"],
    },
    "embed": {
        "required": [],
        "optional": ["ic", "title", "sub", "href"],
    },
    "file_card": {
        "required": [],
        "optional": ["ic", "title", "sub", "action"],
        "nested": {
            "action": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload", "label"],
                }
            },
        },
    },
    "code": {
        "required": [],
        "optional": ["lang", "source"],
    },
    "pulse_card": {
        "required": [],
        "optional": ["when", "h", "body", "actions"],
        "nested": {
            "actions": {
                "item_fields": {
                    "required": ["id", "label", "kind"],
                    "optional": ["payload", "primary"],
                }
            }
        },
    },
    "highlight": {
        "required": ["text"],
        "optional": [],
    },
    "quote": {
        "required": ["text"],
        "optional": ["source"],
    },
    "progress": {
        "required": [],
        "optional": ["label", "current", "total", "severity"],
        "enums": {"severity": ["danger", "success"]},
    },
    "streak": {
        "required": [],
        "optional": ["num", "label", "meta", "pips"],
    },
    "habit": {
        "required": ["name"],
        "optional": ["done", "section"],
    },
    "checklist": {
        "required": ["items"],
        "optional": ["title", "action"],
        "nested": {
            "items": {
                "item_fields": {
                    "required": ["label", "done"],
                    "optional": ["meta"],
                }
            },
            "action": {
                "inline_fields": {
                    "required": ["kind"],
                    "optional": ["payload"],
                }
            },
        },
    },
    "divider": {
        "required": [],
        "optional": ["label"],
    },
    "actions": {
        "required": [],
        "optional": ["items"],
        "nested": {
            "items": {
                "item_fields": {
                    "required": ["id", "label"],
                    "optional": ["primary", "kind", "payload"],
                }
            }
        },
    },
    "section": {
        "required": [],
        "optional": ["title", "meta", "body"],
    },
    "success": {
        "required": [],
        "optional": ["title", "body"],
    },
    "error": {
        "required": [],
        "optional": ["title", "body", "actions"],
        "nested": {
            "actions": {
                "item_fields": {
                    "required": ["id", "label", "kind"],
                    "optional": ["payload"],
                }
            }
        },
    },
    "empty": {
        "required": [],
        "optional": ["title", "sub"],
    },
    "heartbeat": {
        "required": [],
        "optional": ["label", "sub"],
    },
    "skeleton": {
        "required": [],
        "optional": ["lines", "width"],
    },
    "spinner": {
        "required": [],
        "optional": ["label"],
    },
    "chat_message": {
        "required": ["text"],
        "optional": ["role", "ts"],
    },
}


# ─── Data structures ─────────────────────────────────────────────────────────

@dataclass
class Issue:
    line: int  # 0 = unknown
    col: int   # 0 = unknown
    level: str  # "error" | "warning"
    code: str   # e.g. "E001", "W003"
    message: str
    context: str = ""

    def __str__(self):
        loc = f"L{self.line}:C{self.col}" if self.line else "?:?"
        return f"  [{self.level.upper()}] {self.code} @ {loc}: {self.message}" + (
            f"\n         {self.context}" if self.context else ""
        )


@dataclass
class BlockFence:
    line: int
    col: int
    raw: str
    type_name: str
    json_str: str
    parsed: Any = None
    issues: list[Issue] = field(default_factory=list)


@dataclass
class Report:
    fences: list[BlockFence] = field(default_factory=list)
    structural: list[Issue] = field(default_factory=list)

    @property
    def total_errors(self) -> int:
        return sum(
            1
            for f in self.fences
            for i in f.issues
            if i.level == "error"
        ) + sum(1 for i in self.structural if i.level == "error")

    @property
    def total_warnings(self) -> int:
        return sum(
            1
            for f in self.fences
            for i in f.issues
            if i.level == "warning"
        ) + sum(1 for i in self.structural if i.level == "warning")

    @property
    def ok(self) -> bool:
        return self.total_errors == 0


# ─── Fence parser (mirrors rich-content.ts extractFences) ────────────────────

def find_fence_end(text: str, start: int) -> int | None:
    """
    Find the position of the closing `]]` using bracket-depth scanning,
    matching the JS findInlineFenceBody logic.
    Returns the index of the first `]` of `]]`, or None.
    """
    pos = start
    in_string = False
    escape = False
    depth = 0
    while pos < len(text):
        ch = text[pos]
        if escape:
            escape = False
            pos += 1
            continue
        if ch == '\\' and in_string:
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
        if ch in ('{', '['):
            depth += 1
            pos += 1
            continue
        if ch in ('}', ']'):
            if ch == ']' and pos + 1 < len(text) and text[pos + 1] == ']' and depth <= 0:
                return pos
            depth -= 1
            pos += 1
            continue
        pos += 1
    return None


def extract_fences(text: str) -> list[BlockFence]:
    """Extract all [[block:type:{json}]] fences from text."""
    fences: list[BlockFence] = []
    # Track line numbers
    line_map: list[int] = []  # char offset → line number
    cur_line = 1
    for ch in text:
        line_map.append(cur_line)
        if ch == '\n':
            cur_line += 1

    opener = '[[block:'
    i = 0
    while i < len(text):
        start = text.find(opener, i)
        if start == -1:
            break

        line_no = line_map[start] if start < len(line_map) else 0
        col_no = start - (text.rfind('\n', 0, start) + 1) + 1

        after = start + len(opener)

        # Find the colon separating type from JSON
        colon = text.find(':', after)
        if colon == -1 or colon >= len(text):
            fences.append(BlockFence(
                line=line_no, col=col_no, raw=text[start:],
                type_name='?', json_str='',
                issues=[Issue(line_no, col_no, "error", "E001",
                              "Unterminated [[block: — no colon found")]
            ))
            break

        type_name = text[after:colon].strip()

        # Validate type name format
        if not re.match(r'^[a-z][a-z0-9_]*$', type_name):
            fences.append(BlockFence(
                line=line_no, col=col_no,
                raw=text[start:colon+1],
                type_name=type_name, json_str='',
                issues=[Issue(line_no, col_no, "error", "E002",
                              f"Invalid type name '{type_name}' — must be [a-z][a-z0-9_]*")]
            ))
            i = colon + 1
            continue

        # Find closing ]] using bracket-depth scanner
        json_start = colon + 1
        close_pos = find_fence_end(text, json_start)
        if close_pos is None:
            fences.append(BlockFence(
                line=line_no, col=col_no,
                raw=text[start:],
                type_name=type_name, json_str='',
                issues=[Issue(line_no, col_no, "error", "E003",
                              "Unterminated fence — no matching `]]` found")]
            ))
            break

        json_str = text[json_start:close_pos].strip()

        # Forward-walk to find where the outermost { is balanced
        fwd_depth = 0
        fwd_in_string = False
        fwd_escape = False
        json_end = close_pos
        for p in range(json_start, close_pos):
            ch = text[p]
            if fwd_escape:
                fwd_escape = False
                continue
            if ch == '\\' and fwd_in_string:
                fwd_escape = True
                continue
            if ch == '"':
                fwd_in_string = not fwd_in_string
                continue
            if fwd_in_string:
                continue
            if ch in ('{', '['):
                fwd_depth += 1
                continue
            if ch in ('}', ']'):
                fwd_depth -= 1
                if fwd_depth == 0:
                    json_end = p + 1
                    break

        json_str = text[json_start:json_end].strip()
        raw_text = text[start:close_pos + 2]

        fence = BlockFence(
            line=line_no, col=col_no, raw=raw_text,
            type_name=type_name, json_str=json_str
        )

        # Try parsing JSON
        try:
            fence.parsed = json.loads(json_str)
        except json.JSONDecodeError as e:
            fence.issues.append(Issue(
                line_no, col_no + (e.colno or 0), "error", "E004",
                f"JSON parse error: {e.msg}",
                json_str[max(0, (e.colno or 1)-30):(e.colno or 1)+30] if e.colno else ""
            ))

        fences.append(fence)
        i = close_pos + 2

    return fences


# ─── Validators ──────────────────────────────────────────────────────────────

def validate_fence(fence: BlockFence) -> None:
    """Run all validations on a parsed fence."""
    type_name = fence.type_name
    data = fence.parsed

    # 1. Unknown type?
    if type_name not in BLOCK_TYPES:
        fence.issues.append(Issue(
            fence.line, fence.col, "warning", "W001",
            f"Unknown block type '{type_name}' — not in panel registry. "
            f"Will render as <UnknownBlock>.",
            f"Known types: {', '.join(sorted(BLOCK_TYPES.keys()))}"
        ))
        return  # Can't validate data shape for unknown types

    schema = BLOCK_TYPES[type_name]

    # 2. Data must be an object
    if not isinstance(data, dict):
        fence.issues.append(Issue(
            fence.line, fence.col, "error", "E005",
            f"Block data must be a JSON object, got {type(data).__name__}"
        ))
        return

    # 3. Required fields
    for field_name in schema.get("required", []):
        if field_name not in data:
            fence.issues.append(Issue(
                fence.line, fence.col, "error", "E006",
                f"Missing required field '{field_name}' for type '{type_name}'"
            ))

    # 4. Enum constraints
    for enum_field, allowed in schema.get("enums", {}).items():
        if enum_field in data and data[enum_field] not in allowed:
            fence.issues.append(Issue(
                fence.line, fence.col, "warning", "W002",
                f"Field '{enum_field}' = {json.dumps(data[enum_field])} not in allowed values: "
                f"{json.dumps(allowed)}. Component will use default."
            ))

    # 5. Range constraints
    for range_field, (lo, hi) in schema.get("ranges", {}).items():
        if range_field in data:
            val = data[range_field]
            if isinstance(val, (int, float)) and not (lo <= val <= hi):
                fence.issues.append(Issue(
                    fence.line, fence.col, "warning", "W003",
                    f"Field '{range_field}' = {val} outside range [{lo}, {hi}]. "
                    f"Component will clamp."
                ))

    # 6. Nested array validation
    for nest_field, nest_spec in schema.get("nested", {}).items():
        if nest_field not in data:
            continue
        value = data[nest_field]

        # Inline object field (like confirm.confirm)
        if "inline_fields" in nest_spec:
            if not isinstance(value, dict):
                fence.issues.append(Issue(
                    fence.line, fence.col, "error", "E007",
                    f"Field '{nest_field}' must be an object, got {type(value).__name__}"
                ))
                continue
            for req in nest_spec["inline_fields"].get("required", []):
                if req not in value:
                    fence.issues.append(Issue(
                        fence.line, fence.col, "error", "E008",
                        f"Nested field '{nest_field}.{req}' is required"
                    ))
            continue

        # Array field (like actions, items, events)
        if "item_fields" in nest_spec:
            if not isinstance(value, list):
                fence.issues.append(Issue(
                    fence.line, fence.col, "error", "E009",
                    f"Field '{nest_field}' must be an array, got {type(value).__name__}"
                ))
                continue
            for idx, item in enumerate(value):
                if not isinstance(item, dict):
                    fence.issues.append(Issue(
                        fence.line, fence.col, "warning", "W004",
                        f"{nest_field}[{idx}] should be an object, got {type(item).__name__}"
                    ))
                    continue
                for req in nest_spec["item_fields"].get("required", []):
                    if req not in item:
                        fence.issues.append(Issue(
                            fence.line, fence.col, "error", "E010",
                            f"Missing required field '{req}' in {nest_field}[{idx}]"
                        ))

    # 7. Type-specific warnings
    if type_name == "greeting" and "hi" in data and "text" not in data:
        fence.issues.append(Issue(
            fence.line, fence.col, "error", "E011",
            "greeting uses 'text', not 'hi' — {'hi':'...'} renders as raw JSON"
        ))

    if type_name == "columns" and "items" in data:
        items = data["items"]
        if isinstance(items, list):
            for idx, item in enumerate(items):
                if isinstance(item, dict) and "type" in item and "data" in item:
                    if "data" not in item:
                        fence.issues.append(Issue(
                            fence.line, fence.col, "warning", "W005",
                            f"columns.items[{idx}] looks like a block but may not render — "
                            f"nested blocks in columns should use [[block:...]] markers in prose"
                        ))

    # 8. Check for ]] inside JSON values
    if ']]' in fence.json_str:
        fence.issues.append(Issue(
            fence.line, fence.col, "error", "E012",
            "JSON contains `]]` which will break the fence parser. "
            "Escape as `\\\\]\\\\]` or restructure the value."
        ))

    # 9. Multi-line JSON warning
    if '\n' in fence.json_str:
        fence.issues.append(Issue(
            fence.line, fence.col, "warning", "W006",
            "Multi-line JSON may break the parser. Keep block JSON on one line."
        ))

    # 10. Unknown fields warning
    all_known = set(schema.get("required", []) + schema.get("optional", []))
    for key in data:
        if key not in all_known:
            fence.issues.append(Issue(
                fence.line, fence.col, "warning", "W007",
                f"Unknown field '{key}' for type '{type_name}' — will be ignored by component"
            ))


# ─── Structural checks (whole-message level) ────────────────────────────────

def check_structure(text: str, fences: list[BlockFence]) -> list[Issue]:
    """Check structural issues in the full message."""
    issues: list[Issue] = []

    # Check for code-fence block format: ```block\n{...}\n```
    code_fence_re = re.compile(r'```block\s*\n([\s\S]*?)\n```', re.MULTILINE)
    for m in code_fence_re.finditer(text):
        try:
            parsed = json.loads(m.group(1).strip())
            if isinstance(parsed, dict) and "type" in parsed:
                issues.append(Issue(
                    0, 0, "info", "I001",
                    f"Found ```block code fence with type '{parsed['type']}'. "
                    f"This format is also valid but less common than [[block:...]]."
                ))
        except json.JSONDecodeError:
            line_no = text[:m.start()].count('\n') + 1
            issues.append(Issue(
                line_no, 0, "error", "E013",
                "```block code fence contains invalid JSON"
            ))

    # Check for common mistakes
    # 1. Spaces in fence: [[block: type : {json}]]
    bad_fence = re.findall(r'\[\[block:\s+\w+\s+:', text)
    if bad_fence:
        issues.append(Issue(0, 0, "warning", "W008",
                           "Found spaces around colon in fence — use [[block:type:{json}]] with no spaces"))

    # 2. Missing closing ]]
    opens = text.count('[[block:')
    closes = text.count(']]')
    if opens > closes:
        issues.append(Issue(0, 0, "error", "E014",
                           f"Found {opens} [[block: openings but only {closes} ]] closings. "
                           f"Possible unterminated fences."))

    return issues


# ─── Auto-fix suggestions ───────────────────────────────────────────────────

def suggest_fix(fence: BlockFence) -> str | None:
    """Attempt to produce a fixed version of the fence."""
    if fence.parsed is None:
        return None

    data = fence.parsed
    type_name = fence.type_name
    schema = BLOCK_TYPES.get(type_name)
    if not schema:
        return None

    changed = False

    # Fix greeting: hi → text
    if type_name == "greeting" and isinstance(data, dict):
        if "hi" in data and "text" not in data:
            data["text"] = data.pop("hi")
            changed = True

    # Fill required fields with placeholders
    for req in schema.get("required", []):
        if req not in data:
            if req == "text":
                data[req] = "..."
            elif req == "label":
                data[req] = "..."
            elif req == "value":
                data[req] = "..."
            elif req == "name":
                data[req] = "..."
            elif req == "time":
                data[req] = "00:00"
            elif req == "title":
                data[req] = "..."
            elif req == "note":
                data[req] = "..."
            elif req == "urgency":
                data[req] = "med"
            elif req == "items":
                data[req] = []
            elif req == "confirm":
                data[req] = {"kind": "confirm"}
            elif req == "done":
                data[req] = False
            else:
                data[req] = "..."
            changed = True

    if changed:
        json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        return f"[[block:{type_name}:{json_str}]]"

    return None


# ─── Schema printer ──────────────────────────────────────────────────────────

def print_schema(type_name: str) -> None:
    """Print expected schema for a block type."""
    if type_name not in BLOCK_TYPES:
        print(f"Unknown type: {type_name}")
        print(f"Available: {', '.join(sorted(BLOCK_TYPES.keys()))}")
        return

    schema = BLOCK_TYPES[type_name]
    print(f"\n  Block type: {type_name}")
    print(f"  {'─' * 40}")

    if schema.get("required"):
        print(f"  Required fields:")
        for f in schema["required"]:
            print(f"    • {f}")

    if schema.get("optional"):
        print(f"  Optional fields:")
        for f in schema["optional"]:
            print(f"    • {f}")

    if schema.get("enums"):
        print(f"  Enum constraints:")
        for f, vals in schema["enums"].items():
            print(f"    • {f}: {' | '.join(str(v) for v in vals)}")

    if schema.get("ranges"):
        print(f"  Range constraints:")
        for f, (lo, hi) in schema["ranges"].items():
            print(f"    • {f}: [{lo}, {hi}]")

    if schema.get("nested"):
        print(f"  Nested structures:")
        for nest_field, spec in schema["nested"].items():
            if "item_fields" in spec:
                req = spec["item_fields"].get("required", [])
                opt = spec["item_fields"].get("optional", [])
                print(f"    • {nest_field}[]: required=[{', '.join(req)}] optional=[{', '.join(opt)}]")
            if "inline_fields" in spec:
                req = spec["inline_fields"].get("required", [])
                opt = spec["inline_fields"].get("optional", [])
                print(f"    • {nest_field}{{}}: required=[{', '.join(req)}] optional=[{', '.join(opt)}]")

    # Show example
    example = {}
    for f in schema.get("required", []):
        if f == "done":
            example[f] = False
        elif f in ("items", "rows", "headers", "events", "actions", "chips", "options"):
            example[f] = []
        elif f == "confirm":
            example[f] = {"kind": "confirm"}
        elif f == "urgency":
            example[f] = "med"
        elif f == "level":
            example[f] = 2
        else:
            example[f] = "..."
    if not example:
        for f in schema.get("optional", [])[:2]:
            example[f] = "..."
    json_str = json.dumps(example, ensure_ascii=False, separators=(',', ':'))
    print(f"\n  Example: [[block:{type_name}:{json_str}]]")
    print()


# ─── Report formatter ────────────────────────────────────────────────────────

def format_report(report: Report, text: str, show_fix: bool = False) -> str:
    """Format a verification report."""
    lines: list[str] = []
    lines.append("═" * 60)
    lines.append("  Panel-v2 Block Verification Report")
    lines.append("═" * 60)

    if not report.fences and not report.structural:
        lines.append("\n  No [[block:...]] fences found in input.\n")
        return '\n'.join(lines)

    lines.append(f"\n  Fences found: {len(report.fences)}")
    lines.append("")

    # Structural issues
    if report.structural:
        lines.append("  ── Structural Issues ──")
        for issue in report.structural:
            lines.append(str(issue))
        lines.append("")

    # Per-fence issues
    for idx, fence in enumerate(report.fences, 1):
        status = "✓" if not fence.issues else ("✗" if any(i.level == "error" for i in fence.issues) else "⚠")
        lines.append(f"  [{status}] Fence #{idx}: [[block:{fence.type_name}:...]] @ L{fence.line}:{fence.col}")

        if fence.type_name in BLOCK_TYPES:
            schema = BLOCK_TYPES[fence.type_name]
            req = schema.get("required", [])
            opt = schema.get("optional", [])
            if req:
                lines.append(f"        Required: {', '.join(req)}")
            if opt:
                lines.append(f"        Optional: {', '.join(opt[:5])}{'...' if len(opt) > 5 else ''}")
        else:
            lines.append(f"        ⚠ Type '{fence.type_name}' not in panel registry")

        if fence.issues:
            for issue in fence.issues:
                lines.append(str(issue))

            if show_fix and any(i.level == "error" for i in fence.issues):
                fix = suggest_fix(fence)
                if fix:
                    lines.append(f"  💡 Suggested fix:")
                    lines.append(f"         {fix}")
        else:
            lines.append(f"        ✓ Valid — all fields and structure OK")

        lines.append("")

    # Summary
    lines.append("─" * 60)
    total = len(report.fences)
    valid = sum(1 for f in report.fences if not f.issues)
    err = report.total_errors
    warn = report.total_warnings
    lines.append(f"  Summary: {total} fences, {valid} valid, {err} errors, {warn} warnings")
    if err == 0:
        lines.append("  ✓ All blocks are syntactically valid!")
    else:
        lines.append(f"  ✗ {err} error(s) found — blocks may not render correctly.")
    lines.append("═" * 60)
    return '\n'.join(lines)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    if args[0] == '--types':
        print(f"\n  Registered block types ({len(BLOCK_TYPES)}):\n")
        for name in sorted(BLOCK_TYPES):
            schema = BLOCK_TYPES[name]
            req = schema.get("required", [])
            marker = " *" if req else ""
            print(f"    {name}{marker}")
        print(f"\n  * = has required fields")
        print()
        sys.exit(0)

    if args[0] == '--schema':
        if len(args) < 2:
            print("Usage: verify-blocks.py --schema <type>")
            sys.exit(2)
        print_schema(args[1])
        sys.exit(0)

    show_fix = '--fix' in args
    args = [a for a in args if a != '--fix']

    if not args:
        print("Usage: verify-blocks.py <file> | - | --types | --schema <type>")
        sys.exit(2)

    if args[0] == '-':
        text = sys.stdin.read()
    else:
        try:
            with open(args[0], 'r', encoding='utf-8') as f:
                text = f.read()
        except FileNotFoundError:
            print(f"File not found: {args[0]}")
            sys.exit(2)

    # Extract and validate
    fences = extract_fences(text)
    for fence in fences:
        if fence.parsed is not None:
            validate_fence(fence)

    structural = check_structure(text, fences)

    report = Report(fences=fences, structural=structural)
    print(format_report(report, text, show_fix=show_fix))

    sys.exit(0 if report.ok else 1)


if __name__ == '__main__':
    main()
