# 💼 LedgerPro — Business Money Tracker

LedgerPro is a lightweight, secure, and production-ready Next.js application designed for business owners to record credit/debit transactions, compute real-time balances, and manage team permissions with professional accuracy.

---

## 🚀 Key Features

* **Sleek Glassmorphic Dashboard**: A premium dark-leaning interface built with Tailwind CSS, optimized for mobile responsiveness and micro-animations.
* **Resilient Dual-DB Adapter**: Automatic connection to MongoDB Atlas with a seamless JSON file fallback (`src/data/local_db.json`) if the database server is offline.
* **Strict Authentication & Security**:
  * **JWT Sessions**: Secured using SHA-256 tokens stored in HTTP-Only, SameSite=Strict cookies.
  * **Disabled Public Sign-Up**: Public self-registration is closed to prevent unauthorized registry access.
  * **Admin-Managed Accounts**: Authorized members can securely create and invite new user accounts from within the authenticated dashboard.
* **Live Ledger Sorting & Running Balances**: Transactions are computed chronologically to display accurate running balances per line item.
* **Advanced Search & Filtering**: Match records instantaneously by description or amount. Filter by transaction type (Credit/Debit) and date periods (Today, This Week, This Month, or Custom Date ranges).
* **Data Portability**: Full support for downloading the ledger database to Excel (`.xlsx` formatted via SheetJS) or standard CSV format.

---

## 🛠 Tech Stack

* **Frontend**: React 19, Next.js 16 (App Router), Tailwind CSS v4, Lucide React (Icons)
* **Backend**: Next.js Server Actions & API Routes, TypeScript
* **Database**: MongoDB (via native driver) with a local JSON file filesystem fallback
* **Security & Auth**: `bcryptjs` (Password Hashing), `jsonwebtoken` (Session Management)
* **Exports**: `xlsx` (SheetJS)

---

## 📂 Project Structure

```
ledger/
├── .env.local                  # Secure configurations (MongoDB connection, JWT key)
├── package.json                # Core dependencies & scripts
├── next.config.ts              # Next.js settings (Dev overlays deactivated)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts       # Validates credentials & sets HTTP-only cookie
│   │   │   │   ├── logout/route.ts      # Deletes session cookie
│   │   │   │   ├── me/route.ts          # Checks current session validity
│   │   │   │   └── create-user/route.ts # Administrative endpoint to add users
│   │   │   ├── dashboard/route.ts       # Computes metrics (credits, debits, balance)
│   │   │   └── transactions/
│   │   │       ├── route.ts             # GET list & POST new transactions
│   │   │       └── [id]/route.ts        # PUT update & DELETE transaction
│   │   ├── globals.css         # Styling system & custom UI animations
│   │   ├── layout.tsx          # Page wrappers & global SEO metadata
│   │   └── page.tsx            # Secured workspace dashboard
│   ├── data/
│   │   └── local_db.json       # JSON DB Fallback data storage
│   └── lib/
│       ├── auth.ts             # JWT signing & session parsing helpers
│       └── db.ts               # Resilient MongoDB connection manager
```

---

## ⚙️ Environment Configuration

Create a `.env.local` file in the root directory and specify the following variables:

```env
# MongoDB Atlas or Local Connection String
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/database_name?appName=Cluster0

# Secure Secret for Signing Cookies
JWT_SECRET=your_super_secret_alphanumeric_key_goes_here

# Local URL Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🏁 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build & Run in Production Mode
```bash
npm run build
npm run start
```

---

## 🔒 Security Protocols

| Security Threat | Mitigation Strategy |
| :--- | :--- |
| **Cross-Site Scripting (XSS)** | Tokens are saved inside `HttpOnly` cookies, preventing Javascript from reading or stealing credentials. |
| **Cross-Site Request Forgery (CSRF)** | Cookie configuration is set to `SameSite=Strict`, blocking unauthorized cross-origin requests. |
| **Brute Force & Password Theft** | All client credentials are encrypted with `bcrypt` (10 rounds salt) before storing in the database. |
| **Unauthorized Endpoint Access** | Public registration routes are deleted. `/api/auth/create-user` verifies JWT cookies for valid sessions before handling user registration requests. |
| **Data Visibility** | Front-end console outputs (`console.log`, fast-refresh warnings) are purged, and errors return generic, user-friendly feedback to hide server stack traces. |

---

## 📈 Default Admin Account

During initial installation, the application automatically seeds the database with a default user profile to let you sign in immediately:
* **Username**: `hardik`
* **Password**: `@Hardik2005`
