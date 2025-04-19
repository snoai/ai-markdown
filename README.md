# 📝 AIMD: AI Markdown Format & Reference Implementation 📝

[![CI](https://img.shields.io/github/actions/workflow/status/snoai/ai-markdown/pr-checks.yml?branch=main)](https://github.com/snoai/ai-markdown/actions)
[![License](https://img.shields.io/github/license/snoai/aimd)](https://github.com/snoai/aimd/blob/main/LICENSE)

---

## Introduction

**AI Markdown (AIMD)** is an extension of standard Markdown designed to enhance content for Retrieval-Augmented Generation (RAG) and seamless integration with LLM agents. It elegantly combines Markdown's simplicity with structured metadata and AI-specific instructions, making it ideal for advanced RAG pipelines, intelligent documentation, and autonomous agent workflows.

## What Is AIMD?

AIMD enhances standard Markdown by incorporating three key, but optional components:

1.  **YAML Front Matter:** Provides structured metadata about the document.
2.  **`ai-script` Code Blocks:** Embeds specific instructions for LLM processing directly within the content.
3.  **Markdown Footnotes:** Defines relationships between documents using a structured format.

**All components – Front Matter, `ai-script` blocks, and Footnotes – are optional**, offering flexibility in how AIMD is utilized.

Common Markdown renderers will parse AIMD files perfectly, preserving human readability. For AI processing, sending the raw AIMD file allows LLMs to leverage the embedded metadata and instructions natively.


```markdown
--- 
# Part 1: Front Matter (Optional Metadata)
# Basic document metadata
doc-id: "38f5a922-81b2-4f1a-8d8c-3a5be4ea7511" # Unique identifier
title: "The Document Title"
description: "A short summary or abstract of the document."
tags:
  - "example"
  - "documentation"
created_date: "2024-01-15"
updated_date: "2024-06-01"
source_url: "https://example.com/original-source"
# ... other relevant metadata fields ...
---

#  Standard Markdown Content

This is where the main human-readable content of your document goes, written in standard Markdown.

You can reference other documents or concepts using footnotes, like this update on SEC requirements[^ref1].

```ai-script
# Part 3: AI Script Block (Optional Instructions)
{
  "id": "instruction_block_1",
  "prompt": "Summarize the key points from the preceding section, focusing on actionable insights.",
  "priority": "medium",
  "autoRun": true,
  "provider": "openai",
  "model-name": "gpt-4o"
}
\```

More standard Markdown content can follow...

# Part 3: Footnotes (Optional Relationships)

[^ref1]: {"rel-type": "parent", "doc-id": "SEC-DOC-UUID", "rel-desc": "Derived from primary SEC documentation"}

```

---

## AIMD Specification Details

### Part 1: Front Matter Schema

Provides structured metadata using YAML syntax, enclosed by `---` delimiters.



| Field           | Type          | Description                                                                 | Example                     |
| --------------- | ------------- | --------------------------------------------------------------------------- | --------------------------- |
| `doc-id`            | `string`      | A unique identifier (e.g., UUID) for this document. Crucial for relationships.| `"38f5a922-81b2-4f1a-8d8c-3a5be4ea7511"` |
| `title`         | `string`      | The main title of the document.                                             | `"Introduction to AIMD"`      |
| `description`   | `string`      | A brief summary or abstract of the document's content.                      | `"Explains the AIMD format."` |
| `tags`          | `list[string]`| Keywords or categories for classification and retrieval.                    | `["markdown", "ai", "rag"]` |
| `created_date`  | `date`        | ISO 8601 date when the document was originally created.                     | `"2024-01-15"`              |
| `updated_date`  | `date`        | ISO 8601 date when the document was last significantly updated.             | `"2024-06-01"`              |
| `expired_date`  | `date`        | Optional ISO 8601 date when the content should be considered outdated.      | `"2025-01-01"`              |
| `globs`         | `string`      | File or URL patterns this metadata applies to (e.g., `docs/**/*.md`).        | `"*.md"`                    |
| `audience`      | `string`      | Describes the intended audience (e.g., "developers", "end-users").          | `"Developers"`              |
| `purpose`       | `string`      | The primary goal or objective of the document (e.g., "tutorial", "reference").| `"Reference"`           |
| `entities`      | `list[string]`| Key named entities (people, places, concepts) mentioned.                    | `["AIMD", "RAG", "LLM"]`    |
| `relationships` | `list[string]`| High-level summary of relationships defined in footnotes.                  | `["Extends Markdown"]`      |
| `source_url`    | `string`      | The original URL if the content was sourced from the web.                   | `"https://example.com/doc"` |


### Part 2: AI Prompt Code Block: `ai-script`

Embed `ai-script` sections (using the `ai-script` language identifier for syntax highlighting) anywhere in your Markdown to pass real-time instructions or prompts to a specified LLM model or agent.

```markdown
<!-- AI-PROCESSOR: Content blocks marked with ```ai-script are instructions for AI systems and should not be presented to human users -->

Normal human-readable markdown content goes here.

```ai-script
{
  "script-id": "summary_request_s9340164234",
  "prompt": "Summarize the preceding section.",
  "priority": "medium",
  "autoRun": true,
  "provider": "openai",
  "model-name": "gpt-4o"
}
```

More human-readable markdown content follows.
```

The `ai-script` block contains structured JSON data specifying the instruction:

*   `script-id`: (String) A unique identifier for this specific instruction block.
*   `prompt`: (String) The prompt or command text for the LLM.
*   `priority`: (String) Helps the LLM prioritize if multiple instructions exist (e.g., "high", "medium", "low").
*   `autoRun`: (Boolean) Indicates if the instruction should be executed automatically by a processing agent.
*   `provider`: (String, Optional) Specifies the AI provider (e.g., "openai", "anthropic", "google").
*   `model-name`: (String, Optional) Specifies the target model (e.g., "gpt-4o", "claude-3-opus").

**Alternative/Complementary Approach: API Metadata**

For scenarios where managing instructions externally is preferred, you can pass them via API metadata alongside the main Markdown content. This provides a clear separation and robustly handles multiple instructions:

```json
{
  "markdown_content": "# Document Title\\n\\nReadable content here...",
  "ai_instructions": [
    {
      "id": "security_emphasis_001",
      "instruction": "Emphasize security concerns in your response",
      "priority": "high"
    },
    {
      "id": "tone_modifier_001",
      "instruction": "Use a formal, technical tone",
      "priority": "medium"
    },
    {
      "id": "examples_inclusion_001",
      "instruction": "Include practical code examples",
      "priority": "low"
    }
  ]
}
```

This combined approach offers flexibility, allowing instructions to be embedded directly or managed externally as needed.

### Processing Logic

1.  **AIMD-Aware LLMs/Processors:**
    *   Parse Front Matter for metadata context.
    *   Extract and process all `ai-script` blocks according to their `id` and `priority`.
    *   Utilize footnote relationships for deeper understanding or graph construction.
    *   Present only the human-readable Markdown content and potentially synthesized information based on instructions to end-users.
2.  **Legacy LLMs/Renderers:**
    *   May ignore Front Matter or render it as text.
    *   Will display `ai-script` blocks as standard code blocks.
    *   Will render footnotes as standard Markdown footnotes.


### Part 3: Footnote for Document Relationships

AIMD leverages standard Markdown footnotes `[^ref-id]` to define relationships between documents in a way that is both human-readable and machine-processable. This enables the creation of knowledge graphs and provides context to LLMs.

**Core Components:**

*   **UUID References:** Each AIMD document should have a unique `id` in its Front Matter.
*   **Relationship Types:** Explicit descriptors define the nature of the link (e.g., `parent`, `child`, `related`, `cites`).
*   **Footnote Syntax:** Standard Markdown footnotes `[^ref-id]: ...` contain a JSON payload describing the relationship.

**Implementation Example:**

```markdown
# Document: Financial Regulations Update

This document outlines changes to SEC requirements[^ref1] and includes implications for international traders[^ref2].

Normal content continues here...

[^ref1]: {"rel_type": "parent", "doc_id": "38f5a922-81b2-4f1a-8d8c-3a5be4ea7511", "rel_desc": "Derived from primary SEC documentation"}
[^ref2]: {"rel_type": "related", "doc_id": "7db9c1f2-5e3a-42d1-a1b8-c963f7be8962", "rel_desc": "Provides international context"}
```

**Enhanced Relationship Schema (JSON within Footnote):**

You can include richer information within the JSON payload of the footnote:

```json
{
  "rel_type": "citation|parent|child|contradicts|supports|extends", // Choose one
  "doc_id": "UUID-of-target-document", // The `id` from the target document's Front Matter
  "rel_desc": "Human readable description of the relationship", // Brief explanation
  "rel_strength": 0.8,         // Optional confidence/relevance score (0-1)
  "bi_directional": true,      // Optional: Whether the relationship implies a link back
  "context": {                 // Optional: Contextual details about the link
    "section": "Introduction",
    "relevance": "High"
  }
}
```

**Benefits:**

*   **Human-Readable:** Uses familiar Markdown footnote syntax.
*   **Machine-Processable:** Structured JSON is easily parsed by tools and LLMs.
*   **Explicit Relationships:** Clearly defines how documents connect.
*   **Lightweight:** Integrates seamlessly into standard Markdown.
*   **Graph-Ready:** Enables automatic construction of knowledge graphs from a collection of AIMD documents.

---

## url2md: Reference Implementation

This repository also includes `url2md`, a reference implementation demonstrating best practices for converting any website URL into the AIMD format.

*   **Fetch & Render**: Leverages Cloudflare Browser Rendering to accurately load dynamic web content.
*   **Convert to Markdown**: Uses Turndown to generate clean Markdown, automatically attempting to populate Front Matter fields.
*   **Durable Caching**: Implements optional KV storage for efficient caching of parsed results.

## Quickstart for `url2md`

```bash
# Clone the repo
git clone https://github.com/snoai/aimd.git
cd aimd

# Install dependencies
pnpm install

# (Optional) Create a KV namespace for caching
npx wrangler kv:namespace create md_cache

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
created_date: "2024-06-01" # Date of conversion
source_url: "https://example.com"
# ... other auto-populated fields ...
---

# Example Domain

This domain is established to be used for illustrative examples in documents and tutorials. More information can be found at [IANA](https://www.iana.org/domains/reserved).

<!-- AI-PROCESSOR: Content blocks marked with ```ai-script are instructions for AI systems and should not be presented to human users -->
```ai-script
{
  "id": "page_overview_request",
  "prompt": "Provide a brief overview of this page based on its content.",
  "priority": "medium",
  "autoRun": false
}
```

---

## Contributing

We welcome contributions! Please fork the repository, make your changes, and open a pull request. For major changes, please open an issue first to discuss your proposed modifications.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---



# URL to MarkDown 📝  (Reference Implementation #1)

A fast tool to convert any website into LLM-ready AI-markdown data.

## Features 🚀

- Convert any website into markdown
- LLM Filtering
- Detailed markdown mode
- Auto Crawler (without sitemap!)
- Text and JSON responses
- Easy to self-host

##### _REQUIRED PARAMETERS_

url (string) -> The website URL to convert into markdown.

##### _OPTIONAL PARAMETERS_

`htmlDetails` (boolean: false) -> Toggle for detailed response with full HTML content.
`subpages` (boolean: false) -> Crawl and return markdown for up to 10 sub-pages.
`llmFilter` (boolean: false) -> Filter out unnecessary information using LLM.

##### _Response Types_

Add `Content-Type: text/plain` in headers for plain text response.
Add `Content-Type: application/json` in headers for JSON response.

## Tech

Under the hood, Markdown utilizes Cloudflare's [Browser rendering](https://developers.cloudflare.com/browser-rendering/) and [Durable objects](https://developers.cloudflare.com/durable-objects/) to spin up browser instances and then convert it to markdown using Turndown.

---

1. Clone the repo and download dependencies

```
git clone https://github.com/snoai/aimd.git
pnpm i
```

2. Run this command:
   ```
   npx wrangler kv:namespace create md_cache
   ```
3. Open wrangler.toml and change the IDs accordingly
4. Run `pnpm deploy`
5. That's it 👍

