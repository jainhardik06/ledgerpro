# Keyword Discovery Engine

> **Purpose**: From every approved topic, extract the primary keyword, secondary keywords, and semantic cluster. Correct keyword targeting is the difference between ranking and not ranking.

---

## 1. Keyword Types

### Primary Keyword
One per article. This is what the article is *about*. It appears in:
- `<title>`
- `<h1>`
- First 100 words
- URL slug
- Meta description

### Secondary Keywords
3–8 per article. Variations, synonyms, and related terms. They appear naturally in headings and body text. They capture additional ranking positions.

### LSI Keywords (Latent Semantic Index)
10–20 per article. Conceptually related terms that prove topical depth to Google. Examples: if the primary keyword is "expense tracker for freelancers", LSI terms include: "tax deductions", "business expenses", "quarterly taxes", "profit and loss", "invoice tracking".

### Long-tail Variants
Specific, low-volume, low-competition versions of the primary keyword. Often used for the FAQ section to capture featured snippets.

---

## 2. Keyword Research Process

### Step 1: Seed Keyword Expansion

Start with the topic from the Topic Discovery Engine.

Example topic: "expense tracker for freelancers"

Use free tools to expand:
- **Google's autocomplete**: Type "expense tracker for f..." and record all suggestions
- **Google's related searches** (bottom of SERP): Note every related query
- **AnswerThePublic free searches**: Extract question-format keywords

### Step 2: Keyword Clustering

Group related keywords by intent, not just word similarity:

| Cluster | Example Keywords | Intent |
|---|---|---|
| Tool search | "best expense tracker freelancers", "free expense tracker self employed" | Commercial |
| How-to | "how to track expenses as a freelancer", "how do freelancers track expenses" | Informational |
| Comparison | "expense tracker vs spreadsheet for freelancers" | Comparison |
| Tax-focused | "freelance expense tracker for taxes", "track business expenses self-employed" | Transactional |

### Step 3: Select Primary Keyword

Primary keyword selection criteria:
1. Has clear search demand (> 100 monthly searches if available)
2. Matches the article's primary purpose
3. Is achievable within our current domain authority
4. Is not already targeted by an existing article (check `keyword_targets` collection)

### Step 4: Validate Against Existing Targets

Before finalizing, query the Growth DB:
```javascript
db.keyword_targets.findOne({ keyword: primaryKeyword })
```

If it exists, assign it to this article. If not, create a new `keyword_targets` record.

---

## 3. Free Keyword Research Toolkit

| Tool | Cost | Use Case |
|---|---|---|
| Google Search Console | Free | Ranking queries, click data |
| Google Autocomplete | Free | Keyword suggestions |
| Google Related Searches | Free | Long-tail discovery |
| Google Trends | Free | Trending + seasonal keywords |
| AnswerThePublic | Free (3/day) | Question-format keywords |
| AlsoAsked | Free (limited) | PAA (People Also Asked) clusters |
| Ubersuggest | Free (3 searches/day) | Volume + difficulty estimates |
| Keyword Surfer (Chrome) | Free extension | SERP-level volume data |
| SEOquake (Chrome) | Free extension | SERP-level difficulty |

No paid tools needed at early stage. Upgrade to Ahrefs or Semrush only after reaching 10,000 monthly visitors and confirmed SEO traction.

---

## 4. Keyword Data Storage

Every finalized keyword is stored in the `keyword_targets` Growth DB collection:

```json
{
  "keyword": "expense tracker for freelancers",
  "searchVolume": 1200,
  "difficulty": 28,
  "currentRank": null,
  "bestRank": null,
  "trackedSince": "2025-01-15",
  "lastCheckedAt": "2025-01-15"
}
```

`currentRank` and `bestRank` are updated monthly from GSC data or manual SERP checks.

---

## 5. SERP Analysis Protocol

Before assigning a keyword, analyze the top 10 SERP results:

| Factor | What to Look For | Tool |
|---|---|---|
| Domain Authority | Are all results from DA 70+ sites? | MOZ Bar (free) or SEOquake |
| Content Depth | Are the top results thin (< 500 words)? | Manual check |
| Content Freshness | Are results > 2 years old? | Check publish dates |
| Format | Is the SERP showing lists, guides, or tables? | Manual check |
| Intent Match | Does the SERP show informational or product results? | Manual check |

**Rule**: If 8 of the top 10 results are from sites with DA > 70 and have comprehensive content, deprioritize this keyword. Target it after reaching DA 30+.

---

## 6. Featured Snippet Targeting

Featured snippets (the answer box at position 0) are achievable with focused targeting.

### Snippet types and how to win them:

| Snippet Type | How to Win |
|---|---|
| Paragraph answer | Write a direct 40–60 word answer immediately after the question heading |
| Numbered list | Use `<ol>` with steps. Keep each step to one sentence. |
| Table | Use `<table>` with a clear header row. Comparison data wins tables. |
| Definition | "X is defined as..." within the first 100 words of a section. |

**Implementation**: In every blog post, identify one target question from the FAQ section. Format the answer as a featured snippet candidate:

```markdown
## How do freelancers track expenses?

Freelancers track expenses by logging every business purchase in a dedicated expense tracker, categorizing each transaction by type (equipment, software, travel, home office), and reconciling records monthly to prepare for quarterly tax estimates.
```

---

## 7. Keyword Cannibalization Prevention

Two articles should never target the same primary keyword.

**Check before creating any article**:
```
Query: content_topics where primaryKeyword = "X" AND status != "Rejected"
```

If a match exists, either:
1. Assign the new piece to a secondary keyword cluster
2. Merge the two briefs into one comprehensive article

---

*Output feeds directly into the Content Brief Engine.*
