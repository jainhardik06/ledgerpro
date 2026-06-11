# Growth Database Architecture

**Cluster**: `money-os-growth`
**Database**: `money_os_growth`

## Philosophy
The Growth Cluster is strictly decoupled from the Product Engine. Designing for 100k+ content records, 100k+ crawler events, and 1,000+ backlinks requires a schema that will never compete for resources with SaaS transactions, budgets, or auth logic. We design for scale while remaining compatible with MongoDB Atlas Free tier initially.

---

## 1. directories
**Purpose**: Store target directories, app stores, and aggregators where Money OS should be listed.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "name": "string",
  "url": "string",
  "domainRating": "number",
  "authorityScore": "number",
  "category": "string",
  "tags": ["string"],
  "submissionCost": "number",
  "status": "enum['Target', 'Submitted', 'Listed', 'Rejected']",
  "addedAt": "Date"
}
```
**Indexes**: 
- `{ "status": 1, "domainRating": -1 }` (For querying highest-value targets first)
- `{ "url": 1 }` (Unique, to prevent duplicate targets)
**Relationships**: One-to-Many with `directory_submissions`.
**Future Scaling Strategy**: Can remain un-sharded as total global directories rarely exceed 50k.
**Retention Policy**: Indefinite.

---

## 2. directory_submissions
**Purpose**: Track the lifecycle and outcomes of our directory applications.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "directoryId": "ObjectId",
  "submittedAt": "Date",
  "updatedAt": "Date",
  "profileUrl": "string",
  "approvedAt": "Date",
  "status": "enum['Pending', 'Approved', 'Rejected', 'Needs Modification']",
  "notes": "string"
}
```
**Indexes**: 
- `{ "directoryId": 1 }`
- `{ "status": 1, "submittedAt": -1 }`
**Relationships**: Belongs to `directories`.
**Future Scaling Strategy**: Fully covered by Atlas Free Tier constraints.
**Retention Policy**: Indefinite, to maintain historical record of marketing efforts.

---

## 3. backlinks
**Purpose**: Record acquired backlinks from external sources for SEO tracking.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "referringDomainId": "ObjectId",
  "sourceUrl": "string",
  "targetUrl": "string",
  "anchorText": "string",
  "isDoFollow": "boolean",
  "discoveredAt": "Date",
  "lastVerifiedAt": "Date",
  "status": "enum['Active', 'Lost']"
}
```
**Indexes**: 
- `{ "targetUrl": 1, "discoveredAt": -1 }`
- `{ "sourceUrl": 1 }` (Unique)
**Relationships**: Belongs to `referring_domains`.
**Future Scaling Strategy**: As backlinks hit 1000+, indexing by `targetUrl` ensures fast dashboard rendering of page-level SEO health.
**Retention Policy**: Indefinite. Lost backlinks are marked via status, not deleted, for recovery campaigns.

---

## 4. referring_domains
**Purpose**: Aggregate data on unique domains linking to Money OS.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "domain": "string",
  "domainRating": "number",
  "firstSeen": "Date",
  "lastSeen": "Date",
  "totalBacklinks": "number"
}
```
**Indexes**: 
- `{ "domain": 1 }` (Unique)
- `{ "domainRating": -1 }`
**Relationships**: One-to-Many with `backlinks`.
**Future Scaling Strategy**: Scales effortlessly within single shard limits.
**Retention Policy**: Indefinite.

---

## 5. social_profiles
**Purpose**: Centralize our owned social identities and audiences.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "platform": "enum['LinkedIn', 'X', 'GitHub', 'YouTube', 'Instagram']",
  "profileUrl": "string",
  "handle": "string",
  "followersCount": "number",
  "lastUpdated": "Date"
}
```
**Indexes**: 
- `{ "platform": 1 }` (Unique)
**Relationships**: One-to-Many with `social_posts`.
**Future Scaling Strategy**: Negligible storage requirement.
**Retention Policy**: Indefinite.

---

## 6. social_posts
**Purpose**: Log of our social media marketing distribution and their performance metrics.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "profileId": "ObjectId",
  "postUrl": "string",
  "content": "string",
  "postedAt": "Date",
  "metrics": {
    "likes": "number",
    "shares": "number",
    "comments": "number",
    "clicks": "number"
  },
  "metricsUpdatedAt": "Date"
}
```
**Indexes**: 
- `{ "profileId": 1, "postedAt": -1 }`
**Relationships**: Belongs to `social_profiles`.
**Future Scaling Strategy**: Metrics can be updated via background cron jobs without impacting core product throughput.
**Retention Policy**: Indefinite.

---

## 7. product_hunt_assets
**Purpose**: Launch materials and configuration for Product Hunt campaigns.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "campaignId": "string",
  "launchDate": "Date",
  "tagline": "string",
  "description": "string",
  "videoUrl": "string",
  "images": ["string"],
  "makers": ["string"],
  "firstComment": "string",
  "status": "enum['Draft', 'Scheduled', 'Launched']"
}
```
**Indexes**: 
- `{ "launchDate": -1 }`
**Relationships**: None.
**Future Scaling Strategy**: Flat collection, low volume.
**Retention Policy**: Indefinite.

---

## 8. seo_pages
**Purpose**: Registry and performance tracking of programmatic SEO landing pages.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "slug": "string",
  "title": "string",
  "targetKeywordId": "ObjectId",
  "publishedAt": "Date",
  "lastModifiedAt": "Date",
  "status": "enum['Draft', 'Published', 'Archived']",
  "metricsLast30Days": {
    "pageviews": "number",
    "bounceRate": "number",
    "conversions": "number"
  }
}
```
**Indexes**: 
- `{ "slug": 1 }` (Unique)
- `{ "status": 1, "publishedAt": -1 }`
**Relationships**: Belongs to `keyword_targets`.
**Future Scaling Strategy**: Supports 100k+ pages. Metrics are pre-aggregated via separate cron to keep reads instant on the dashboard.
**Retention Policy**: Indefinite.

---

## 9. blog_posts
**Purpose**: Storage and CMS tracking for written blog articles.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "slug": "string",
  "title": "string",
  "author": "string",
  "category": "string",
  "contentMd": "string",
  "publishedAt": "Date",
  "updatedAt": "Date",
  "status": "enum['Draft', 'InReview', 'Published']"
}
```
**Indexes**: 
- `{ "slug": 1 }` (Unique)
- `{ "category": 1, "publishedAt": -1 }`
**Relationships**: None.
**Future Scaling Strategy**: Text content scales well. If `contentMd` exceeds 16MB document limit (impossible for standard articles), we gridFS.
**Retention Policy**: Indefinite.

---

## 10. docs_pages
**Purpose**: Registry of documentation content for LLM ingestion and tracking.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "slug": "string",
  "path": "string",
  "title": "string",
  "version": "string",
  "lastUpdated": "Date",
  "isDeprecated": "boolean"
}
```
**Indexes**: 
- `{ "slug": 1 }` (Unique)
- `{ "path": 1 }`
**Relationships**: None.
**Future Scaling Strategy**: Lightweight registry mirroring the Astro static files.
**Retention Policy**: Indefinite.

---

## 11. content_topics
**Purpose**: Seed topics generated by the AI trend analyzer.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "topic": "string",
  "score": "number",
  "searchVolumeEstimate": "number",
  "status": "enum['Backlog', 'Planning', 'Writing', 'Done', 'Rejected']",
  "discoveredAt": "Date"
}
```
**Indexes**: 
- `{ "score": -1, "status": 1 }`
- `{ "topic": 1 }` (Unique)
**Relationships**: One-to-Many with `content_briefs`.
**Future Scaling Strategy**: 100k+ records easily supported. Compound index ensures fast backlog sorting.
**Retention Policy**: Rejected topics purged after 1 year. Done topics retained indefinitely.

---

## 12. content_briefs
**Purpose**: Detailed outlines generated before full AI article generation.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "topicId": "ObjectId",
  "targetKeyword": "string",
  "headings": ["string"],
  "faqs": [{ "q": "string", "a": "string" }],
  "generatedAt": "Date",
  "status": "enum['Draft', 'Approved', 'Rejected']",
  "humanReviewer": "string"
}
```
**Indexes**: 
- `{ "topicId": 1 }`
- `{ "status": 1 }`
**Relationships**: Belongs to `content_topics`.
**Future Scaling Strategy**: Fits within Free Tier.
**Retention Policy**: Approved briefs retained indefinitely. Rejected briefs purged after 90 days.

---

## 13. keyword_targets
**Purpose**: SEO keyword tracking and SERP performance.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "keyword": "string",
  "searchVolume": "number",
  "difficulty": "number",
  "currentRank": "number",
  "bestRank": "number",
  "trackedSince": "Date",
  "lastCheckedAt": "Date"
}
```
**Indexes**: 
- `{ "keyword": 1 }` (Unique)
- `{ "currentRank": 1 }`
**Relationships**: One-to-Many with `seo_pages`.
**Future Scaling Strategy**: Can scale to 10k keywords without sharding.
**Retention Policy**: Indefinite.

---

## 14. crawler_visits
**Purpose**: Log hits from Googlebot, Bingbot, ClaudeBot, etc., to monitor AI Discovery penetration.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "userAgent": "string",
  "botFamily": "enum['Google', 'Bing', 'Claude', 'GPTBot', 'Perplexity', 'Other']",
  "path": "string",
  "timestamp": "Date",
  "responseCode": "number",
  "responseTimeMs": "number"
}
```
**Indexes**: 
- `{ "timestamp": -1 }`
- `{ "botFamily": 1, "timestamp": -1 }`
- `{ "path": 1 }`
**Relationships**: None.
**Future Scaling Strategy**: For 100k+ events daily, this collection becomes write-heavy. Must not share I/O with Product.
**Retention Policy**: 90 Days. We use a MongoDB TTL Index on `timestamp` to automatically drop documents older than 90 days to prevent Atlas Free Tier storage exhaustion.

---

## 15. growth_metrics
**Purpose**: Aggregated daily stats (visitors, conversions, signups) for the Discovery Dashboard.
**Schema**: 
```json
{
  "_id": "ObjectId",
  "date": "string", 
  "totalVisitors": "number",
  "organicSignups": "number",
  "discoverySignups": "number",
  "topPaths": [{ "path": "string", "visits": "number" }]
}
```
**Indexes**: 
- `{ "date": -1 }` (Unique)
**Relationships**: None.
**Future Scaling Strategy**: Pre-aggregated time-series style data. Extremely lightweight.
**Retention Policy**: Indefinite.

---

## 16. launch_campaigns
**Purpose**: Coordinate multi-channel marketing pushes (e.g., Product Hunt + X + LinkedIn).
**Schema**: 
```json
{
  "_id": "ObjectId",
  "name": "string",
  "startDate": "Date",
  "endDate": "Date",
  "platformsTargeted": ["string"],
  "goalSignups": "number",
  "actualSignups": "number",
  "status": "enum['Planning', 'Active', 'Completed']"
}
```
**Indexes**: 
- `{ "startDate": -1 }`
**Relationships**: None.
**Future Scaling Strategy**: Low volume.
**Retention Policy**: Indefinite.
