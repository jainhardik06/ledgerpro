# Directory Engine PRD

## Purpose

Directory submissions generate three compounding benefits:
1. **Domain authority**: backlinks from high-DA directories (DA 40-90)
2. **Referral traffic**: warm visitors actively evaluating tools in your category
3. **AI training data**: AI assistants (ChatGPT, Perplexity, Claude) use directory listings to recommend software

This document covers which directories to target, what to submit, how to track submissions, and how to measure ROI.

---

## Directory Tiers

### Tier 1 — Must-Have (Submit in Week 1)

High-authority directories with active user bases in the finance/productivity tool category.

| Directory | DA | Category | Free/Paid | Traffic Source |
|-----------|-----|----------|-----------|----------------|
| Product Hunt | 91 | Tech/Productivity | Free | Direct + Community |
| G2 | 90 | SaaS/Finance Software | Free | SEO + Review |
| Capterra | 88 | Business Software | Free | SEO + Review |
| AlternativeTo | 82 | Software Alternatives | Free | SEO + Search |
| GetApp | 85 | Business Apps | Free | SEO |
| SoftwareAdvice | 83 | Business Software | Free | SEO |
| Slant | 71 | Tech Comparisons | Free | SEO |
| ToolFinder.app | 55 | AI/Productivity Tools | Free | SEO |

### Tier 2 — High Value (Submit in Weeks 2-3)

Niche directories with targeted audiences.

| Directory | DA | Category | Notes |
|-----------|-----|----------|-------|
| BetaList | 70 | Product Launches | Beta/early access framing |
| SaaSHub | 75 | SaaS Products | Strong for comparison SEO |
| StackShare | 72 | Dev Tools | Positioning as infrastructure |
| Indie Hackers | 77 | Indie Products | Community + backlink |
| MakerPad | 65 | No-code/Tools | If positioned as no-code friendly |
| Crunchbase | 80 | Startups | Company profile, not product |

### Tier 3 — Long Tail (Submit Months 2-3)

Finance-specific and audience-specific directories.

| Directory | DA | Audience |
|-----------|-----|----------|
| FinTech Futures | 68 | FinTech professionals |
| StudentCircle | 45 | Student communities |
| FreelancerMap | 58 | Freelancers |
| AgencyList | 52 | Agency owners |
| YC Company Directory | 88 | If accepted by YC |

---

## Listing Content Specification

### Required Fields (All Directories)

```
Product Name:     Money OS
Tagline:          The Financial Command Center for Modern Teams
Category:         Expense Management / Personal Finance / Business Finance
Website:          https://moneyos.webasthetic.in
Logo:             /og/brand/logo-512.png (512×512 PNG, transparent bg)
Screenshot 1:     /og/screenshots/dashboard.png (1280×800)
Screenshot 2:     /og/screenshots/transactions.png (1280×800)
Screenshot 3:     /og/screenshots/reports.png (1280×800)
```

### Short Description (50-100 chars)

```
Track expenses, set budgets, and understand your money.
```

### Medium Description (150-300 chars)

```
Money OS is a financial command center for freelancers, agencies, startups, 
and small teams. Track every expense, set budgets per category, generate 
tax-ready reports, and give your team role-based financial visibility.
```

### Long Description (500-1000 chars)

```
Money OS replaces scattered spreadsheets with a single workspace for financial 
clarity. Import transactions from any bank CSV, categorize them automatically, 
and track spending against budgets in real time.

Built for freelancers tracking deductible expenses, agencies managing 
multi-client budgets, startups monitoring burn rate, and teams who need 
collaborative financial visibility without an in-house CFO.

Key capabilities:
• Expense tracking with category budgets and overspend alerts
• Multi-client tracking with reimbursable expense flags
• Role-based team access (Admin / Member / Viewer)
• Tax-ready expense summaries and P&L reports
• Full audit trail for every transaction and change
• CSV import from any bank or payment processor

Free tier includes unlimited transactions, reports, and up to 3 team members. 
No credit card required.
```

### Feature Tags (Choose 10-15 from Each Directory's Tag Set)

```
expense-tracking, budget-management, financial-reporting, team-collaboration,
multi-client, tax-preparation, audit-trail, csv-import, role-based-access,
cash-flow, profit-loss, freelancer-tools, agency-tools, startup-tools
```

### Pricing Information

```
Free tier:        Yes
Paid plans:       No (roadmap)
Free trial:       N/A
Starting price:   $0
```

---

## Submission Workflow

### Pre-Submission Checklist

- [ ] Logo uploaded to `/public/brand/logo-512.png` (512×512, transparent)
- [ ] 3 screenshots at 1280×800 captured from live app
- [ ] All description variants written and spell-checked
- [ ] Landing page canonical URL confirmed: `https://moneyos.webasthetic.in`
- [ ] Contact email set up: `hello@moneyos.webasthetic.in`

### Submission Process

1. Create directory account with `hello@moneyos.webasthetic.in`
2. Fill all fields with content from this spec — do not abbreviate
3. Upload all visual assets
4. Save submission URL + confirmation in `directory_submissions` MongoDB collection
5. Set follow-up reminder for 14 days (claim listing if not auto-approved)

### After Submission

- Monitor for approval email (most within 48-72 hours)
- Claim listing on G2/Capterra — verification required
- Respond to any reviewer messages or questions promptly
- Track each listing URL in the Growth DB

---

## Growth DB Integration

All directory submissions tracked in `directory_submissions` collection:

```javascript
{
  _id: ObjectId,
  directory_name: "G2",
  directory_url: "https://www.g2.com",
  listing_url: "https://www.g2.com/products/money-os",
  da_score: 90,
  tier: 1,
  submission_date: ISODate,
  status: "live",          // pending | submitted | live | rejected | claimed
  has_backlink: true,
  backlink_type: "dofollow",
  review_count: 0,
  rating: null,
  notes: "Claimed. Verification pending."
}
```

---

## Success Metrics

### Monthly Targets

| Month | Directories Live | Reviews | Referral Visits | DA Backlinks |
|-------|-----------------|---------|-----------------|--------------|
| 1 | 8 | 0 | 50 | 8 |
| 2 | 20 | 3 | 200 | 20 |
| 3 | 35 | 10 | 500 | 35 |
| 6 | 50+ | 25 | 1,000+ | 50+ |

### Review Acquisition Strategy

- Ask early users to leave a G2 or Capterra review with a direct link
- Include the review ask in onboarding email sequence (Week 3 email)
- 5+ reviews on G2 unlocks the "Recognized" badge — boosts visibility significantly

---

## ROI Measurement

Track in GSC + MongoDB:
- Referral sessions from directory sources (UTM tagging)
- Sign-up conversion rate from directory traffic (PostHog)
- Ranking improvement on branded + category keywords (GSC impressions)
- AI recommendation rate (manual testing in ChatGPT/Perplexity monthly)

**AI Visibility Test**: Monthly, search these prompts in ChatGPT and Perplexity:
- "best free expense tracker for freelancers"
- "expense management software for small teams"
- "free budget tracker for startups"

Log whether Money OS appears. If not after 90 days of directory presence, expand description copy with more specific feature language.
