# Topic Discovery Engine

> **Purpose**: Systematically find content topics that have real search demand, low competition, and direct relevance to Money OS users. No gut feeling, no guessing. Data-driven topic discovery.

---

## 1. What a "Good Topic" Looks Like

A topic is worth writing about if it satisfies ALL of the following:

| Criterion | Definition | Threshold |
|---|---|---|
| **Search Demand** | People actually search for this | > 100 monthly searches |
| **Intent Match** | The searcher could become a Money OS user | Financial mgmt, freelancing, budgeting, accounting |
| **Competition** | We can realistically rank | Keyword difficulty < 40 (early stage), < 60 (after 100 articles) |
| **Uniqueness** | We can say something others haven't | At least 1 differentiating angle |
| **Freshness** | The topic won't be stale in 12 months | Evergreen, or tied to a recurring event (tax season) |

---

## 2. Discovery Sources

### Source 1: Google Search Console (Free, after indexing)
**What to look for**: Queries we're appearing for but not ranking on page 1. These are "almost ranking" topics — easy wins.

**Process**:
1. Open GSC → Performance → Queries
2. Filter: Position 11–30 (page 2-3 results)
3. Sort by Impressions
4. Any query with > 50 impressions and position 11–30 = write a dedicated piece

### Source 2: AnswerThePublic / AlsoAsked (Free tier)
**What to look for**: "People also ask" questions for our core topics.

**Seed terms**:
- `expense tracker`
- `budget tracker`
- `freelancer finance`
- `agency finance`
- `small business accounting`

**Output**: Topic clusters organized by intent question type (who/what/when/where/why/how).

### Source 3: Reddit + Quora (Free, manual)
**What to look for**: Questions in `/r/freelance`, `/r/smallbusiness`, `/r/personalfinance` that have high upvotes and no great answer.

**Process**:
1. Search: `site:reddit.com/r/freelance "expense" OR "budget" OR "invoice"`
2. Find threads with 50+ upvotes where the top answer is incomplete or links to a paid tool
3. Log topic in Growth DB `content_topics` collection

### Source 4: Competitor Blog Analysis (Free, manual)
**What to look for**: Topics our direct competitors rank for that we don't have yet.

**Competitors to monitor**:
- Freshbooks blog
- Wave blog
- Bonsai blog
- Honeybook blog
- Quickbooks blog

**Process**: Visit their blog index, note titles. Any topic relevant to Money OS users = add to backlog.

### Source 5: Trending Searches (Free, Google Trends API)
**What to look for**: Seasonally rising topics we can publish ahead of the peak.

**Examples**:
- "`freelance tax deductions`" spikes in February (pre-tax season)
- "`Q4 expense review`" spikes in November
- "`new year budget`" spikes in December

**Process**: Run Google Trends comparisons for our seed terms. Topics rising 50%+ month-over-month = priority publish.

---

## 3. Scoring Model

Each topic is scored on entry to the Growth DB `content_topics` collection.

### Scoring Formula

```
Score = (SearchVolumeScore × 0.4) + (IntentScore × 0.3) + (CompetitionScore × 0.2) + (UniquenessScore × 0.1)
```

### SearchVolumeScore (0–10)
| Monthly Searches | Score |
|---|---|
| > 10,000 | 10 |
| 1,000–9,999 | 7 |
| 100–999 | 5 |
| 10–99 | 2 |
| < 10 | 0 |

### IntentScore (0–10)
| Intent | Score |
|---|---|
| Direct product fit (e.g., "expense tracker for freelancers") | 10 |
| Adjacent (e.g., "how to invoice clients") | 7 |
| Awareness (e.g., "how freelancers manage money") | 5 |
| Low-relevance (e.g., "best cameras for freelancers") | 0 |

### CompetitionScore (0–10)
| Keyword Difficulty | Score |
|---|---|
| 0–20 | 10 |
| 21–40 | 7 |
| 41–60 | 5 |
| 61–80 | 2 |
| 81–100 | 0 |

### UniquenessScore (0–10)
| Angle Available | Score |
|---|---|
| No articles exist on this specific angle | 10 |
| Weak articles dominate SERP (thin, outdated) | 7 |
| Medium competition with improvable content | 5 |
| Strong competitor content, hard to outrank | 2 |

---

## 4. Topic Lifecycle

```
DISCOVERED → BACKLOG → PLANNING → BRIEF GENERATED → WRITING → REVIEW → PUBLISHED → TRACKING
```

Status stored in `content_topics.status` field:
- `Backlog` — discovered, not yet prioritized
- `Planning` — assigned to a content sprint
- `Writing` — brief approved, article in progress
- `Done` — published and indexed
- `Rejected` — failed scoring threshold or duplicate

---

## 5. Topic Prioritization Rules

Publish in this order:

1. **Product-intent topics first** — "`expense tracker for freelancers`" ranks faster, converts better
2. **Thin-competition topics next** — easy wins build domain authority
3. **Pillar topics third** — long-form comprehensive guides (2,500+ words)
4. **Supporting cluster topics** — feed authority to pillar pages
5. **Trending/seasonal topics** — publish 4–6 weeks before the seasonal peak

---

## 6. Rejection Criteria

Reject a topic if:
- Score < 3
- Direct competitor is Wikipedia or HubSpot (domain authority > 90) with comprehensive coverage
- Topic requires expertise we cannot authentically claim
- Topic is explicitly irrelevant to financial management

---

*This engine feeds the Keyword Discovery Engine → Brief Engine → Publishing Pipeline.*
