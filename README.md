# 📝 AIMD: AI Markdown Format & Reference Implementation 📝

[![CI](https://img.shields.io/github/actions/workflow/status/snoai/ai-markdown/pr-checks.yml?branch=main)](https://github.com/snoai/ai-markdown/actions)
[![License](https://img.shields.io/github/license/snoai/aimd)](https://github.com/snoai/aimd/blob/main/LICENSE)

---

## Motivation & Introduction

Large Language Models (LLMs) and AI agents increasingly rely on processing diverse content, but standard formats often lack the necessary structure and context for optimal performance. Converting complex web pages or documents into LLM-friendly plain text can be imprecise, losing valuable metadata and structural information.

**AI Markdown (AIMD)** addresses this challenge by extending standard Markdown with optional, structured components designed specifically for AI consumption. It enhances content for Retrieval-Augmented Generation (RAG), seamless integration with LLM agents, and robust knowledge graph construction. AIMD elegantly combines Markdown's readability with:

1.  **Structured Metadata (YAML Front Matter):** Provides rich context about the document.
2.  **Embedded AI Instructions (`ai-script` blocks):** Allows direct commands for LLM processing within the content.
3.  **Explicit Document Relationships (Footnotes):** Defines connections between documents for deeper understanding.

AIMD files remain perfectly readable by humans and standard Markdown renderers, while providing enhanced data for AI systems when parsed directly.

## What Is AIMD? (Core Components)

AIMD enhances standard Markdown by incorporating three key, **optional** components:

1.  **YAML Front Matter:** Provides structured metadata (e.g., `doc-id`, `title`, `tags`, `purpose`).
2.  **`ai-script` Code Blocks:** Embeds structured JSON instructions for LLM processing directly within the content (e.g., summarization prompts, model preferences).
3.  **Markdown Footnotes with JSON:** Defines typed relationships between documents using a structured JSON format within standard footnotes (e.g., `parent`, `child`, `cites`).

**Key Principle:** All AIMD components are optional. You can use only Front Matter, only `ai-script`, only Footnotes, or any combination, offering flexibility based on your needs.

**Example AIMD Structure:**

````markdown
---
# Part 1: Front Matter (Optional Metadata)
doc-id: "38f5a922-81b2-4f1a-8d8c-3a5be4ea7511" # Unique identifier (UUID recommended)
title: "The Document Title"
description: "A short summary or abstract."
tags: ["example", "documentation"]
purpose: "Demonstration"
created-date: "2024-01-15T09:00:00Z" # ISO 8601 format
updated-date: "2024-06-01T15:30:00Z" # ISO 8601 format
---

# Standard Markdown Content

This is human-readable content.

Reference another document about SEC requirements[^ref1].

```ai-script
# Part 2: AI Script Block (Optional Instructions)
<!-- AI-PROCESSOR: Content blocks marked with ```ai-script are instructions for LLM or AI Agents and should not be presented to human users -->
{
  "script-id": "instruction-block-1",
  "prompt": "Summarize the key points from the preceding section, focusing on actionable insights.",
  "priority": "medium",
  "auto-run": true,
  "provider": "openai",
  "model-name": "gpt-4o",
  "parameters": { 
    "temperature": 0.7,
    "max-tokens": 150
  },
  "runtime-env": "server",
  "output-format": "markdown"
}
```

More standard Markdown content...

# Part 3: Footnotes (Optional Relationships)

[^ref1]: {"rel-type": "parent", "doc-id": "SEC-DOC-UUID", "rel-desc": "Derived from primary SEC documentation"}
````

---

## AIMD vs. Other Formats

While other approaches exist to make content LLM-friendly, AIMD offers unique advantages:

*   **Standard Markdown:** AIMD is a superset. Standard Markdown lacks structured metadata, embedded instructions, and explicit relationship definitions.
*   **`llms.txt` ([Details](https://github.com/AnswerDotAI/llms-txt)):** A proposed standard using a root `/llms.txt` file with Markdown to link to LLM-friendly content.
    *   **AIMD Advantages:**
        1.  **Richer Structured Metadata:** AIMD's YAML Front Matter supports a more detailed and standardized schema than `llms.txt`'s basic structure, enabling deeper context and complex filtering.
        2.  **Embedded AI Instructions:** AIMD's `ai-script` blocks provide fine-grained, in-context control over LLM processing, unlike `llms.txt` which primarily links to content.
        3.  **Explicit Document Relationships:** AIMD's structured JSON footnotes offer a more robust way to define typed relationships for knowledge graphs compared to `llms.txt`'s simpler annotated links.

## AIMD Specification Details

### Part 1: Front Matter Schema

Provides structured metadata using YAML syntax, enclosed by `---` delimiters.

| Field           | Type          | Description                                                                 | Example                     |
| --------------- | ------------- | --------------------------------------------------------------------------- | --------------------------- |
| `doc-id`            | `string`      | A unique identifier for this document (UUID format recommended). Crucial for relationships. | `"38f5a922-81b2-4f1a-8d8c-3a5be4ea7511"` |
| `title`         | `string`      | The main title of the document.                                             | `"Introduction to AIMD"`      |
| `description`   | `string`      | A brief summary or abstract of the document's content.                      | `"Explains the AIMD format."` |
| `tags`          | `list[string]`| Keywords or categories for classification and retrieval.                    | `["markdown", "ai", "rag"]` |
| `created-date`  | `string`        | ISO 8601 timestamp (date and time with timezone) when the document was originally created. | `"2024-01-15T09:00:00Z"`              |
| `updated-date`  | `string`        | ISO 8601 timestamp when the document was last significantly updated.      | `"2024-06-01T15:30:00Z"`              |
| `expired-date`  | `string`        | Optional ISO 8601 timestamp when the content should be considered outdated. | `"2025-01-01T00:00:00Z"`              |
| `globs`         | `string`      | File or URL patterns this metadata applies to (e.g., `docs/**/*.md`).        | `"*.md"`                    |
| `audience`      | `string`      | Describes the intended audience (e.g., "developers", "end-users").          | `"Developers"`              |
| `purpose`       | `string`      | The primary goal or objective of the document (e.g., "tutorial", "reference").| `"Reference"`           |
| `entities`      | `list[string]`| Key named entities (people, places, concepts) mentioned.                    | `["AIMD", "RAG", "LLM"]`    |
| `relationships` | `list[string]`| High-level summary of relationships defined in footnotes.                  | `["Extends Markdown"]`      |
| `source-url`    | `string`      | The original URL if the content was sourced from the web.                   | `"https://example.com/doc"` |


### Part 2: AI Prompt Code Block: `ai-script`

Embed `ai-script` sections (using the `ai-script` language identifier) anywhere in your Markdown to pass structured JSON instructions to LLMs or agents. The comment `<!-- AI-PROCESSOR: ... -->` can optionally signal to processors that the block is intended for AI and not human display.

```markdown
Normal human-readable markdown content goes here.

<!-- AI-PROCESSOR: Content blocks marked with ```ai-script are instructions for AI systems and should not be presented to human users -->
```ai-script
{
  "script-id": "summary-request-s9340164234",
  "prompt": "Summarize the preceding section.",
  "priority": "medium", // "high", "medium", "low"
  "auto-run": true,
  "provider": "openai", // Optional: "anthropic", "google", etc.
  "model-name": "gpt-4o",  // Optional: "claude-3-opus", etc.
  "parameters": { // Optional: Provider-specific parameters
    "temperature": 0.5,
    "max-tokens": 100
  },
  "runtime-env": "server", // Optional: Hint for execution environment ("browser", "server", "edge")
  "output-format": "markdown" // Optional: Desired output format ("text", "json", "markdown", "image-url", etc.)
}
```

More human-readable markdown content follows.
```

**JSON Fields:**

*   `script-id`: (String) Unique ID for the instruction block.
*   `prompt`: (String) The instruction/prompt text.
*   `priority`: (String) Execution priority ("high", "medium", "low").
*   `auto-run`: (Boolean) Hint for automated execution.
*   `provider`: (String, Optional) Preferred AI provider.
*   `model-name`: (String, Optional) Preferred AI model.
*   `parameters`: (Object, Optional) A JSON object containing provider-specific parameters to be sent to the LLM along with the prompt (e.g., `{"temperature": 0.7, "max-tokens": 500}`).
*   `runtime-env`: (String, Optional) Suggests the ideal runtime environment or endpoint for executing the script (e.g., `"https://api.openai.com/v1/responses"`, `"docker"`, `"on-site-default"`).
*   `output-format`: (String, Optional) Specifies the desired format for the output generated by the LLM or agent (e.g., `"markdown"`, `"text"`, `"json"`, `"image-url"`).

**Alternative/Complementary Approach: API Metadata**

Instructions can also be passed externally via API metadata for separation of concerns:

```json
{
  "markdown-content": "# Document Title\\n\\nReadable content here...",
  "ai-scripts": [
    { "id": "sec-emphasis-001", "prompt": "Emphasize security", "priority": "high" },
    { "id": "formal-tone-001", "prompt": "Use formal tone", "priority": "medium" }
    // ... more instructions
  ]
}
```

### Part 3: Footnote for Document Relationships

Leverage standard Markdown footnotes `[^ref-id]` with embedded JSON to define explicit, typed relationships between documents. Essential for knowledge graphs.

**Core Components:**

*   **`doc-id` References:** Each AIMD document needs a unique `doc-id` in its Front Matter.
*   **Relationship Types:** Defined in the JSON (e.g., `parent`, `child`, `related`, `cites`, `supports`, `contradicts`).
*   **Footnote Syntax:** `[^ref-id]: { ... JSON payload ... }`

**Implementation Example:**

```markdown
This document outlines changes[^ref1] and implications[^ref2].

[^ref1]: {"rel-type": "parent", "doc-id": "UUID-of-parent-doc", "rel-desc": "Derived from SEC docs"}
[^ref2]: {"rel-type": "related", "doc-id": "UUID-of-related-doc", "rel-desc": "Provides context"}
```

**Enhanced Relationship Schema (JSON within Footnote):**

```json
{
  "rel-type": "citation|parent|child|contradicts|supports|extends", // Choose one
  "doc-id": "UUID-of-target-document", // Target document's `doc-id`
  "rel-desc": "Human-readable description of the relationship",
  "rel-strength": 0.8,         // Optional: Confidence/relevance score (0-1)
  "bi-directional": true,      // Optional: If the relationship implies a link back
  "context": {                 // Optional: Details about the link's location/nature
    "section": "Introduction",
    "relevance": "High"
  }
}
```

**Benefits:**

*   **Human-Readable & Machine-Processable:** Combines familiar syntax with structured data.
*   **Explicit & Typed Relationships:** Clearly defines how documents connect.
*   **Graph-Ready:** Enables automatic knowledge graph construction.

---

## Processing Logic & Best Practices

*   **AIMD-Aware Processors:** Should parse Front Matter, extract and prioritize `ai-script` blocks, and interpret footnote relationships. Only human-readable Markdown and synthesized outputs should be shown to end-users.
*   **Legacy Renderers:** Will typically ignore Front Matter or render it as text, display `ai-script` as code blocks, and show footnotes normally.
*   **Clean `.md` Files:** Inspired by `llms.txt`, a recommended best practice is to provide clean, AIMD-formatted Markdown versions of content whenever possible (e.g., alongside HTML). Tools like `url2md` (see below) facilitate this.

---

## url2md: Reference Implementation

This repository includes `url2md`, a Cloudflare Worker demonstrating how to convert website URLs into AIMD format.

*   **Fetch & Render**: Uses Cloudflare Browser Rendering for dynamic content.
*   **Convert to Markdown**: Employs Turndown and attempts to auto-populate Front Matter.
*   **Optional Caching**: Supports KV storage.

## Quickstart for `url2md`

```bash
# Clone the repo
git clone https://github.com/snoai/aimd.git
cd aimd

# Install dependencies
pnpm install

# (Optional) Create a KV namespace for caching
npx wrangler kv:namespace create md-cache

# Update wrangler.toml with your account ID and (if using cache) KV namespace ID
# Deploy the Cloudflare Worker
pnpm deploy
```

After deployment, you can use the provided HTTP API.

## Usage Examples (`url2md` API)

### HTTP API Request

Convert a website to AIMD, requesting detailed HTML structure and LLM filtering:

```bash
curl -X POST https://<your-worker-domain>/convert \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "htmlDetails": true,    # Include detailed HTML tags
    "subpages": false,       # Set to true to crawl subpages (limit 10)
    "llmFilter": true       # Use LLM to refine content (requires AI binding)
  }'
```

#### Sample API Response (AIMD Format):

```markdown
---
title: "Example Domain" 
description: "Illustrative example domain for testing purposes."
tags:
  - "example"
created-date: "2024-06-01T15:30:00Z" # Date of conversion
source-url: "https://example.com"
# ... other auto-populated fields ...
---

# Example Domain

This domain is established to be used for illustrative examples in documents and tutorials. More information can be found at [IANA](https://www.iana.org/domains/reserved).

<!-- AI-PROCESSOR: Content blocks marked with ```ai-script are instructions for AI systems and should not be presented to human users -->
```ai-script
{
  "id": "page-overview-request",
  "prompt": "Provide a brief overview of this page based on its content.",
  "priority": "medium",
  "auto-run": false
}
```

---

## Contributing

We welcome contributions! Please fork, make changes, and open a pull request. Discuss major changes via issues first.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Next Steps & Ecosystem

The AIMD specification is evolving. Future work includes:

*   Developing standardized parsers and libraries for various languages.
*   Integrating AIMD support into RAG frameworks and agent platforms.
*   Building a community around best practices and extensions.
*   Exploring validation tools for AIMD syntax and schema.

Join the discussion and help shape the future of AI-native content!

