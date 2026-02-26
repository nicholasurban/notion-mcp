# Read Mode
Get a page's properties and content as markdown.

## Required params
- page_id: Notion page UUID (32 hex chars with hyphens)

## Output
Properties as key-value pairs, then page body as markdown.
Content wrapped in <untrusted_content> tags.
