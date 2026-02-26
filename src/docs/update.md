# Update Mode
Update page properties and/or body content.

## Required params
- page_id: page UUID (single) or page_ids in properties (batch)

## Optional
- properties: key-value object of fields to update
- content: new markdown body (replaces existing content)

## Batch update
Set properties.page_ids to array of UUIDs. All get same property updates.
Returns summary with count and any errors.
