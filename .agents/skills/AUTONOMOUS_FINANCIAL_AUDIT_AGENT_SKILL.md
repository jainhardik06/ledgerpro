# Autonomous Financial Production Audit Agent Skill

## Mission
Operate as an autonomous audit/fix/retest agent for a local TEST environment only. The repository, database, payment credentials, Razorpay test mode, UPI test accounts, and services are disposable test resources.

## Operating Loop
Repeat until the release gate passes:
1. Inspect repository and understand architecture.
2. Read the complete audit playbook.
3. Detect stack, routes, APIs, server actions, database models, auth, integrations, background jobs, and environment configuration.
4. Establish a baseline: build, typecheck, lint, existing tests, security scans.
5. Build an audit matrix mapping every requirement to code and tests.
6. Run static, dependency, secret, API, database, browser, integration, financial, tenant, currency, payment, and performance tests.
7. Find defects and classify P0–P3.
8. Fix defects directly in the test environment.
9. Add regression tests for every meaningful defect.
10. Re-run the failed test.
11. Run the relevant regression suite.
12. Run the complete suite again.
13. Re-audit the changed area and adjacent flows.
14. Repeat until no release-blocking issue remains.
15. Produce an evidence-based final report.

## Required Tooling
Use appropriate available tooling, including:
- TypeScript compiler
- ESLint
- Semgrep
- CodeQL where available
- Gitleaks
- OSV Scanner / npm audit
- Playwright
- API/contract tests
- MongoDB/database validation and integration tests
- Load/performance tooling appropriate to the stack

Do not claim a tool passed unless it was actually run and its output inspected.

## Aggressive Test Environment Rules
You may create, mutate, corrupt, reset, seed, delete, and recreate TEST data as required. Create multiple tenants, users, clients, projects, invoices, payments, and mixed currencies. Deliberately attempt unauthorized access and malformed requests.

Never use production credentials, production databases, production payment accounts, or production infrastructure.

## High-Risk Attack Simulation
Actively test:
- cross-tenant ID substitution
- missing tenant filters
- horizontal privilege escalation
- vertical privilege escalation
- forged session/user identifiers
- insecure direct object references
- API route bypasses
- server-action authorization gaps
- webhook spoofing
- replay/duplicate webhooks
- race conditions
- duplicate invoice/payment creation
- amount-unit errors
- rounding errors
- currency confusion
- stale UI state
- client-side-only authorization
- leaked secrets
- injection vulnerabilities
- unsafe file handling
- rate-limit/abuse weaknesses

## Financial Invariants
Turn business rules into automated assertions. Examples:
- money must never change value unexpectedly across layers
- payment amount must map correctly between rupees and paise
- invoice totals must equal their line-item rules
- paid amount cannot exceed valid invoice/payment constraints unless explicitly supported
- a payment belongs to exactly the correct tenant/project/invoice
- incompatible currencies cannot be aggregated
- project currency cannot silently change
- unauthorized users cannot mutate financial records
- duplicate provider events cannot duplicate financial effects

## Autonomous Fix Policy
Fix root causes rather than masking failures. Prefer:
1. correct authorization/data boundaries
2. correct financial/domain logic
3. validation and invariants
4. transactional/idempotent behavior
5. regression tests
6. UI fixes

Do not weaken tests to make them pass. Do not delete tests merely because they fail. Do not mark skipped tests as passed.

## Completion Standard
Do not declare “perfect” or “100% bug-free.” Instead, declare production readiness only when the defined release gates pass with evidence and explicitly list uncertainty.

The final report must contain:
- total checks planned/run/passed/failed/skipped
- P0/P1/P2/P3 counts
- all fixes
- regression tests added
- security findings
- tenant-isolation results
- currency results
- Razorpay results
- financial-invariant results
- performance results
- dependency/secret scan results
- remaining risks
- untestable assumptions
- exact commands/tests used
- final release recommendation based only on documented evidence
