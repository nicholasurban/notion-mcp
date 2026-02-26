# Query Mode
Query a configured database with filters and sorts.

## Required params
- database: friendly name from config
- query: JSON filter (optional, returns all if omitted)

## Filter syntax
{"property": "Status", "status": {"equals": "Published"}}
Compound: {"and": [filter1, filter2]} or {"or": [...]}

## Sort
sort param as JSON: {"property": "Created", "direction": "descending"}

## Output
Pipe-delimited table with configured fields. Includes total/returned counts.
