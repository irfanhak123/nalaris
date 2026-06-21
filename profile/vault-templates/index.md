---
title: Vault — Index
type: meta
created: <today>
status: active
---

# Vault — Index

> The user's personal knowledge base. The agent reads from and writes to this vault.

## Zones

| Zone | Purpose |
|------|---------|
| `Ops/` | Configuration, directives, habits, goals |
| `Journal/` | Daily entries, reflections |

## How it works

The vault is an Obsidian-compatible markdown folder. Every file has YAML frontmatter and wikilinks. The agent reads files fresh each tick — edit them in Obsidian or any text editor, and the agent picks up changes immediately.
