# Social Metadata Architecture

This document defines the strict schema and operational rules for the `social_profiles` and `social_assets` collections within the `money_os_growth` MongoDB cluster. 

By tracking these centrally, the Discovery Intelligence Center acts as the absolute source of truth for our social footprint. This prevents rogue accounts, ensures all team members use the exact verified URLs, and guarantees that our static Astro sites build using approved asset links.

---

## 1. Collection: `social_profiles`

**Purpose**: Track the existence, status, and health (followers) of official Money OS social presences.

### Schema (Zod / TypeScript Definition)
```typescript
{
  _id: ObjectId;
  platform: 'LinkedIn' | 'X' | 'GitHub' | 'YouTube' | 'ProductHunt' | 'Other';
  url: string; // The canonical URL (e.g., https://x.com/MoneyOSHQ)
  username: string; // The handle (e.g., @MoneyOSHQ)
  followers: number; // For growth tracking
  verified: boolean; // Indicates if the platform has awarded a blue check/verification
  status: 'active' | 'suspended' | 'archived'; // Operational status
  createdAt: Date;
  updatedAt: Date;
}
```

### Database Strategy & Indexing
- **Index 1**: `{ "platform": 1 }` (Unique). We enforce a strict unique index here to guarantee there is only ever *one* official record per platform in the database.
- **Index 2**: `{ "status": 1 }`. Allows the Discovery Dashboard to instantly filter for `active` platforms without scanning archived data.

---

## 2. Collection: `social_assets`

**Purpose**: A centralized registry of all exported banners, logos, and Open Graph images that comply with the `SOCIAL_ASSET_SYSTEM.md`. 

**Why store this in a DB?** Instead of hardcoding image URLs in our Astro frontmatter or Next.js layout files, we can dynamically pull the "official" Open Graph image URL from this database. If we rebrand, we update the DB record, and all systems update automatically.

### Schema (Zod / TypeScript Definition)
```typescript
{
  _id: ObjectId;
  type: 'banner' | 'avatar' | 'open_graph' | 'logo_transparent';
  platformTarget: 'LinkedIn' | 'X' | 'GitHub' | 'YouTube' | 'Global';
  path: string; // The deployed URL (e.g., https://discovermoneyos.webasthetic.in/images/og-main.png)
  dimensions: string; // Strict layout checking (e.g., "1200x630")
  createdAt: Date;
}
```

### Database Strategy & Indexing
- **Index 1**: `{ "platformTarget": 1, "type": 1 }`. This allows an API route to instantly query "Give me the Global Open Graph image" or "Give me the X Banner".

---

## 3. CRUD & Dashboard Integration Strategy

### Data Ingestion (Admin CRUD)
An internal Server Action interface is built within the Super Admin portal (`/super-admin/discovery/social`). It allows the Founder to:
1. Input and manage the active links and follower counts of the social profiles.
2. Register the URLs of the official social assets once they are exported from Figma and uploaded to the hosting provider.

### Discovery Dashboard Display
The `page.tsx` of the Discovery Intelligence Center queries `social_profiles` to render the "Social Infrastructure" block. It verifies the Legitimacy Layer is active before proceeding to directories or SEO.

### Future Automation
Once the initial 4 platforms (LinkedIn, X, GitHub, YouTube) are inserted manually, the schema is prepared to accept a lightweight background cron job. This cron will hit the respective platform APIs (e.g., Twitter API v2, GitHub API) and silently update the `followers` count every night at midnight UTC.
