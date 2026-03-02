# Databases

## Available databases

| Name | Description | Aliases |
|------|-------------|---------|
| written-content | Blog posts/articles for outliyr.com | blog, articles, posts |
| podcast-content | Podcast episodes & guest interviews | podcasts, episodes, interviews |
| youtube-content | YouTube video planning & tracking | youtube, videos |
| products-shop | Shop product catalog (300+ items) | shop, products, store |
| supplement-routine | Nick's daily supplement stack | supplements, stack, routine |
| approved-products | Curated approved products list | approved, recommended products |
| deals | Time-limited discount deals | discounts, sales, promos, coupons |
| tasks | Project task management | todo, project tasks |
| offers | Lead magnets, courses, paid offers | lead magnets, courses |
| daily-log | Daily health/habit tracker | daily tracker, habits, health log |
| time-log | Weekly time allocation | time tracking, hours |
| books-courses | Books/courses reading list | books, reading list, learning |
| social-media | Social content calendar | social, content calendar |
| affiliate-details | Affiliate partnerships & codes | affiliates, partners, commissions |

## Aliases
You can use any alias in the `database` parameter and it will resolve to the canonical name.
Example: `database: "shop"` → resolves to `products-shop`.

## Database-scoped search
When you provide both `query` and `database` in search mode, the server searches across text properties (title, rich_text, url) instead of relying on Notion's title-only search API. This finds matches in Brand, Slug, Categories, etc.

Databases with configured searchFields: products-shop, affiliate-details.
