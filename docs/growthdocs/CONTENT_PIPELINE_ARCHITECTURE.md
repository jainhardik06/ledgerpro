# Content Pipeline Architecture

> **Purpose**: Define the complete journey from raw topic idea to published, indexed, and monetized content. Every stage is documented, every hand-off is explicit, and every stage has a clear exit criterion.

---

## 1. Pipeline Overview

```
Stage 1: TREND DISCOVERY
        ↓
Stage 2: KEYWORD RESEARCH
        ↓
Stage 3: TOPIC SCORING & BACKLOG
        ↓
Stage 4: BRIEF GENERATION
        ↓
Stage 5: ARTICLE GENERATION (Human or AI)
        ↓
Stage 6: IMAGE GENERATION
        ↓
Stage 7: QUALITY VALIDATION
        ↓
Stage 8: PUBLISHING
        ↓
Stage 9: INDEXING & SUBMISSION
        ↓
Stage 10: PERFORMANCE MONITORING
        ↓ (feedback loop)
Stage 1
```

---

## 2. Stage-by-Stage Specification

### Stage 1: Trend Discovery

**Input**: Nothing
**Output**: Raw topic ideas in `content_topics` with status `Backlog`

**Process (current — manual)**:
1. Weekly 30-minute session: check AnswerThePublic, competitor blogs, Reddit, Google Trends
2. Log qualifying topics directly to Growth DB via Discovery Intelligence Center
3. Set initial `score` estimate

**Process (future — automated)**:
- Nightly GitHub Actions cron: fetch Google Trends data for seed terms, detect rising topics
- Write new `content_topics` records with status `Backlog` automatically
- Trigger notification to founder (Slack webhook or email)

---

### Stage 2: Keyword Research

**Input**: `content_topics` with status `Backlog`
**Output**: `keyword_targets` record created, `content_topics.score` updated

**Process (current — manual)**:
1. For each backlog topic, complete the Keyword Research protocol (see Keyword Discovery Engine)
2. Update `content_topics.score` with calculated score
3. Create `keyword_targets` record with volume, difficulty, and tracking start date

**Process (future — semi-automated)**:
- Founder triggers keyword research for a batch of topics via Discovery Intelligence Center
- System queries Serper API (or SerpAPI) to gather SERP data
- AI extracts volume estimates from SERP features and autocomplete

---

### Stage 3: Topic Scoring & Backlog Management

**Input**: `content_topics` with scores
**Output**: `content_topics` with status `Planning` (for top-scored items)

**Rules**:
- Weekly: sort backlog by score descending
- Move top 3–5 topics from `Backlog` → `Planning` (production capacity)
- `Rejected` topics are never deleted — they inform future research

**Dashboard**: Visible in Discovery Intelligence Center → Content Engine section.

---

### Stage 4: Brief Generation

**Input**: `content_topics` with status `Planning`
**Output**: `content_briefs` with status `Approved`

**Process (current — manual)**:
1. Follow Content Brief Engine template
2. Create brief in Growth DB
3. Human reviews and approves

**Process (future — AI-assisted)**:
1. Trigger AI brief generation from Discovery Intelligence Center
2. Claude API generates brief following CONTENT_BRIEF_ENGINE.md template
3. Brief stored as `Draft` in Growth DB
4. Founder reviews, approves or rejects with notes
5. System moves topic from `Planning` → `Writing`

**Cost estimate (future AI)**: ~$0.002/brief via Claude API. 100 briefs/month = $0.20.

---

### Stage 5: Article Generation

**Current (manual)**:
- Founder writes article following the approved brief
- Article is an MDX file created in `money-os-discovery/src/content/blog/`
- All frontmatter fields from the brief template are populated

**Future (AI-assisted — Month 3+)**:
- AI generates article MDX from approved brief
- Human reviews article for:
  - Voice and tone compliance (ANTI_AI_SLOP_GUIDELINES.md)
  - Factual accuracy
  - Internal link placement
  - FAQ completeness
- Approval creates a PR to the `money-os-discovery` repo

**MDX File Structure**:
```
src/content/blog/
  expense-tracker-for-freelancers.mdx
  agency-budget-management-guide.mdx
  freelance-tax-preparation-2025.mdx
```

---

### Stage 6: Image Generation

**Input**: Approved article + OG image brief from content brief
**Output**: OG image (1200×630 PNG) + Featured image stored in `public/og/` and `public/images/`

**Current (manual)**:
- Create OG image in Canva using Money OS brand template
- Export as PNG at 1200×630
- Place in `public/og/{slug}.png`
- Reference in MDX frontmatter: `coverImage: /og/expense-tracker-for-freelancers.png`

**Future (AI-generated — Month 6+)**:
- Image prompt is generated from brief (see IMAGE_PROMPTING_GUIDE.md)
- Image generated via Stability AI or DALL-E batch API
- Auto-committed to `public/og/` via CI pipeline
- Cost estimate: ~$0.02/image. 100 images/month = $2.00.

---

### Stage 7: Quality Validation

Every article passes a quality gate before publishing.

**Checklist (automated, at CI level)**:
- [ ] Frontmatter has all required fields (Astro content schema validation)
- [ ] No broken internal links (Astro build link checker)
- [ ] OG image file exists in `public/og/`
- [ ] Word count >= brief's target word count

**Checklist (manual, human review)**:
- [ ] Voice is direct, noun-first, no fluff (ANTI_AI_SLOP_GUIDELINES.md)
- [ ] Facts are verified (no hallucinated statistics)
- [ ] Internal links are relevant and correctly placed
- [ ] FAQ section has minimum 5 Q&A pairs
- [ ] Design Constitution formatting standards met

---

### Stage 8: Publishing

**Current**:
1. Move MDX file status: `draft` → `published`
2. Push to `main` branch
3. Vercel auto-deploys (2–5 minute build)
4. Update `blog_posts` record in Growth DB with `publishedAt` timestamp

**Future (automated)**:
1. Approved article + image auto-commits via GitHub Actions
2. PR auto-opened with article file and OG image
3. Founder reviews PR (1-2 min review)
4. Merge triggers Vercel deployment
5. CI script auto-updates `blog_posts` Growth DB record via API route

---

### Stage 9: Indexing & Submission

After publish:
1. Google Search Console → URL Inspection → Request Indexing (manual, for first 50 articles)
2. Google Sitemap submission (auto, via `sitemap.xml` ping after each deploy)
3. Bing Webmaster Tools → URL submission (manual setup, then automatic)
4. Future: Use IndexNow protocol for instant multi-engine notification

**Expected indexing time**: 2–48 hours for Google (domain age dependent).

---

### Stage 10: Performance Monitoring

At 30 days post-publish:
1. Check GSC for impressions, clicks, position
2. Update `keyword_targets.currentRank` for the primary keyword
3. Update `blog_posts.metricsLast30Days` if applicable
4. Decision:
   - Ranking page 1: maintain and build internal links to it
   - Ranking page 2–3: update content, add FAQ pairs, strengthen internal links
   - Not ranking: evaluate whether the keyword difficulty was misassessed

**Review cadence**: Monthly for each published article, weekly for the top 10 by traffic.

---

## 3. Free Tier Capacity Analysis

Running this pipeline on zero-cost infrastructure:

| Component | Free Solution | Paid Alternative (future) |
|---|---|---|
| Trend Discovery | Google Trends API, Reddit manual | Exploding Topics Pro |
| Keyword Research | GSC, AnswerThePublic, Autocomplete | Ahrefs ($99/mo) |
| Brief Generation | Manual (current) / Claude API ($0.002/brief) | — |
| Article Generation | Manual (current) / Claude API (~$0.05/article) | — |
| Image Generation | Canva (Student Pack) / Stability AI ($0.02/image) | MidJourney |
| Publishing | GitHub Actions (free) + Vercel (free) | — |
| Indexing | Google IndexNow (free) + GSC submission | — |
| Performance | Google Search Console (free) | Ahrefs |

**Month 1 cost at 10 articles/month**: ~$0

**Month 6 cost at 50 articles/month with AI assist**: ~$3.50 total (briefs + images)

---

## 4. Human Review Protocol

The human review layer ensures AI content never degrades brand quality.

**Review time target**: 15 minutes per article maximum.

**Review focus**:
1. Does the opening sentence hook immediately? (No "In today's world...")
2. Is every claim verified or clearly attributed?
3. Do the FAQ answers satisfy the question in under 80 words?
4. Are the internal links accurate (not broken, not irrelevant)?
5. Does the OG image look premium?

If any answer is "no", the article is rejected back to `Draft` with reviewer notes.

---

*This pipeline is the operational backbone of the Content Engine. Every article produced by Money OS passes through every stage of this pipeline.*
