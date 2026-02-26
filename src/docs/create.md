# Create Mode
Create a new page in a database or under a parent page.

## Required params
- database: friendly name from config
- properties: key-value object matching database schema

## Optional
- content: markdown string for page body

## Property format
{"Title": "My Page", "Status": "Draft", "Tags": ["A", "B"]}
Property names must match database schema exactly (case-sensitive).
