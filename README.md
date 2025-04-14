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

```

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

## Support

Support me by simply starring this repository! ⭐
