# AIMD: AI Markdown Format & Reference Implementation ⚡📝

[![CI](https://img.shields.io/github/actions/workflow/status/snoai/aimd/ci.yml?branch=main)](https://github.com/snoai/aimd/actions)
[![License](https://img.shields.io/github/license/snoai/aimd)](https://github.com/snoai/aimd/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/url-to-md)](https://www.npmjs.com/package/url-to-md)

---

## Introduction

**AI Markdown (AIMD)** is an extension of Markdown that integrates structured front matter metadata for Retrieval-Augmented Generation (RAG) and seamless consumption by LLM agents. It combines the simplicity of Markdown with powerful AI-centric instructions, making it ideal for RAG pipelines, documentation, and autonomous agent workflows.

## What Is AIMD?

AIMD builds upon standard Markdown by adding a YAML front matter section and a special `ai-script` code block to embed runtime instructions for LLMs.

### Front Matter Schema

```yaml
---
# Basic document metadata
title: "Your Document Title"
description: "A short summary or abstract of the document."
tags:
  - "example"
  - "documentation"
date: "2024-06-01"

# AI Script instructions for LLM processing
aiScript:
  model: "gpt-4"
  provider: "openai"
  version: "4.0"
  prompt: |
    Summarize the following content focusing on key insights and action items.
  autoRun: false
---
```

| Field         | Type     | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| `title`       | string   | Document title                                        |
| `description` | string   | Brief summary or abstract                             |
| `tags`        | list     | Keywords for categorization                           |
| `date`        | date     | ISO 8601 date of creation or last update              |
| `aiScript`    | object   | Instructions for LLM processing                       |

### Special Code Block: `ai-script`

Embed an `ai-script` section anywhere in your Markdown to pass real-time instructions to an LLM agent:

```ai-script
model: "gpt-4"
provider: "openai"
version: "4.0"
prompt: |
  Extract the primary architectural patterns from the code snippet below.
autoRun: true
```

## url2md: Reference Implementation

This repository demonstrates best practices for converting any website URL into the AIMD format.

- **Fetch & Render**: Leverages Cloudflare Browser Rendering to load dynamic content.
- **Convert to Markdown**: Uses Turndown to generate clean Markdown with front matter.
- **Durable Caching**: Optional KV storage for caching parsed results.

## Quickstart

```bash
# Clone the repo
git clone https://github.com/snoai/aimd.git
cd aimd

# Install dependencies
pnpm install

# Create a KV namespace for caching
npx wrangler kv:namespace create md_cache

# Update wrangler.toml with namespace IDs and deploy
pm deploy
```

## Usage Examples

### HTTP API

Convert a website to AIMD with detailed HTML content and LLM filtering:

```bash
curl -X POST https://<your-domain>/convert \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "htmlDetails": true,
    "subpages": true,
    "llmFilter": true
  }'
```

#### Sample Response (AIMD):

```markdown
---
title: "Example Domain"
description: "Illustrative example domain for testing purposes."
tags:
  - "example"
date: "2024-06-01"
aiScript:
  model: "gpt-4"
  provider: "openai"
  version: "4.0"
  prompt: |
    Provide a brief overview of this page.
  autoRun: false
---

# Example Domain

This domain is established to be used for illustrative examples in documents and tutorials. More information can be found at [IANA](https://www.iana.org/domains/reserved).
```

## Contributing

We welcome contributions! Please fork the repository, make your changes, and open a pull request. For major changes, open an issue first to discuss your proposed modifications.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Appendix: Original README.md

```markdown
# URL to MarkDown ⚡📝

A fast tool to convert any website into LLM-ready markdown data.

## Features 🚀

- Convert any website into markdown
- LLM Filtering
- Detailed markdown mode
- Auto Crawler (without sitemap!)
- Text and JSON responses
- Easy to self-host
- ... All that and more, for FREE!

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
git clone 
pnpm i
```

2. Run this command:
   ```
   npx wrangler kv:namespace create md_cache
   ```
3. Open Wrangler.toml and change the IDs accordingly
4. Run `pnpm deploy`
5. That's it 👍
```
