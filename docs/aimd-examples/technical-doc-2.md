---
# Create a new example showing advanced footnote relationships in AIMD
---
doc-id: tech-doc-002
title: Advanced Footnote Relationships in AIMD
description: Example document showcasing advanced footnote relationships.
tags:
  - footnote
  - relationships
  - aimd-example
created_date: 2024-07-26
---

# Advanced Footnote Usage

AIMD footnotes enable explicit, structured relationships between documents, enhancing discoverability and context.

In this document we: 

- Reference the core technical specification[^core-spec].
- Link to the dynamic content generation example[^dyn-gen].
- Cite an external Markdown reference guide[^md-guide].

## How It Works

Footnote references appear inline (`[^id]`), and definitions at the bottom carry JSON payloads describing the relationships.

---

## Footnote Definitions

[^core-spec]: {"rel_type":"reference","doc_id":"tech-doc-001","rel_desc":"Core technical specification overview"}
[^dyn-gen]: {"rel_type":"related","doc_id":"dyn-gen-001","rel_desc":"Dynamic content generation example"}
[^md-guide]: {"rel_type":"citation","doc_id":"external-md-guide-uuid","rel_desc":"Official Markdown syntax guide"}
