# Search Mode
Search across all configured databases or within a specific database.

## Required params
- query: search text

## Optional params
- database: scope search to a specific database (enables property-level search)
- limit: max results (default 50, max 200)

## Global search (no database param)
Searches page titles across all configured databases via Notion's search API.
Output: Title | Database | Last Edited

## Database-scoped search (with database param)
Queries text properties directly using `contains` filters. Searches title, rich_text, url, email, and phone_number fields. If the database has `searchFields` configured, only those fields are searched.

This finds matches in any text property — not just titles. Use this to find items by Brand, Slug, Code, etc.

Output: Same as query mode (full property table with priority fields first).
