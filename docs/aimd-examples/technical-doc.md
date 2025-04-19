---
doc-id: tech-doc-001
title: AIMD Technical Specification Overview
description: Sample technical document demonstrating footnote relationships in AIMD.
tags:
  - technical
  - specification
  - aimd-example
created_date: 2024-07-26
---

# AIMD Technical Specification

The AI Markdown (AIMD) format extends standard Markdown with optional structured metadata[^fm] and embedded AI instruction blocks[^ai]. It also supports defining explicit relationships between documents using footnotes[^kg] to enable knowledge graph construction.

## Core Components Covered

1. **Front Matter**: Provides document-level metadata such as `doc-id`, `title`, and `tags`[^fm].
2. **`ai-script` Blocks**: Allows embedding JSON-based AI instructions within the content[^ai].
3. **Footnote Relationships**: Defines machine-readable links to other documents[^kg].

---

## Footnote Definitions

[^fm]: {"rel_type":"related","doc_id":"spec-frontmatter-uuid","rel_desc":"See Front Matter schema for field details"}
[^ai]: {"rel_type":"child","doc_id":"script-blocks-uuid","rel_desc":"Detailed AI Script Block specification"}
[^kg]: {"rel_type":"parent","doc_id":"knowledge-graph-uuid","rel_desc":"Overview of Knowledge Graph integration"}
