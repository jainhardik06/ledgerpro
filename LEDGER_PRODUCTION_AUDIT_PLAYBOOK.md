# Ledger Financial Command Center — Production Audit Playbook

## Objective
Audit the entire financial command center before production. Treat financial correctness, tenant isolation, security, data integrity, and payment correctness as release-blocking concerns.

## Severity
- P0: Critical — security breach, cross-tenant access, incorrect money, payment corruption, auth bypass, data loss. Must be 0 before production.
- P1: High — major functional or reliability issue. Must be 0 before production unless explicitly documented and accepted.
- P2: Medium — meaningful defect or hardening gap.
- P3: Low — polish or non-blocking improvement.

## 30 Audit Areas
1. Architecture and dependency map
2. Authentication and session security
3. Authorization and RBAC
4. Multi-tenant isolation
5. User/workspace membership
6. API security
7. Database security and integrity
8. Data validation and schema consistency
9. Financial calculations and rounding
10. Financial invariants
11. Multi-currency/project-currency integrity
12. Dashboard and reporting consistency
13. Frontend/backend contract consistency
14. Invoice lifecycle
15. Razorpay integration
16. Payment amount units (rupees/paise)
17. Razorpay webhook authenticity and idempotency
18. Payment state machine and reconciliation
19. AI-generated financial/invoice content
20. Audit logs and traceability
21. Error handling and failure recovery
22. Transactions/concurrency/race conditions
23. Data lifecycle and deletion
24. Backup/restore and disaster recovery
25. Secrets/configuration management
26. Dependency/supply-chain security
27. Static code/security analysis
28. End-to-end/browser testing
29. Performance/scalability/load testing
30. Deployment/infrastructure/production readiness

## Mandatory Multi-Currency Rules
- Every financial amount must have an unambiguous currency context.
- Account/workspace, client, and project currency relationships must be explicit in the data model.
- A project configured as INR must display INR throughout its project-specific financial flows.
- A USD project must not silently display INR.
- Dashboards aggregating multiple projects must never add incompatible currencies.
- Do not perform currency conversion unless the product explicitly invokes a documented conversion feature.
- Test switching between projects, clients, and workspaces.
- Test mixed-currency datasets and aggregation boundaries.
- Currency must survive API, database, server action, component, report, invoice, and AI-summary boundaries.

## Mandatory Financial Tests
Test zero, negative, fractional, very large, boundary, decimal, rounding, duplicate, concurrent, and malformed amounts. Trace critical values from UI → server → database → external payment provider → webhook → database → UI.

## Razorpay Audit
- Verify rupees-to-paise conversion exactly once.
- Test ₹1, ₹10, ₹99.99, ₹100, ₹25,000, large values, decimal values, and invalid values.
- Confirm no double conversion.
- Verify amount shown to user equals amount sent to Razorpay after unit conversion.
- Verify currency consistency.
- Validate webhook signatures in the real integration path.
- Test duplicate/out-of-order webhooks.
- Test retries, timeouts, provider failures, cancelled/failed/successful payments.
- Enforce idempotency.
- Ensure a payment cannot be attached to another tenant/client/project.
- Ensure invoice status cannot be forged from the client.
- Reconcile payment state after refresh/retry.
- Never trust client-provided payment success.

## Release Gate
Production is blocked if:
- Any P0 remains open.
- Any cross-tenant data access is possible.
- Any tested financial calculation is incorrect.
- Any currency context can be lost or silently changed.
- Any payment amount can be mis-scaled.
- Authentication/authorization bypass exists.
- Critical webhook/payment integrity is unverified.
- Critical flows lack meaningful automated tests.
- Agent cannot provide evidence for a claimed pass.

Final report must include tests run, failures found, fixes made, regression tests added, remaining risks, untestable areas, and exact production blockers.
