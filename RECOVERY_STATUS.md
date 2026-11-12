# FarmRise recovery branch

This branch is a safe working copy. The production `main` branch and production database have not been intentionally modified by this recovery work.

## Recovered and rebuilt
- Next.js project manifest and configuration
- Authentication helpers and login, logout, current-user and registration routes
- Responsive farmer dashboard and account pages
- Wallet, investment-plan and investment-history views
- Deposit and withdrawal request flow for MTN MoMo, Telecel Cash and AT Money
- Separate admin dashboard for user accounts, wallet adjustments, request review and investment-plan management
- Admin-initiated wallet payout workflow with balance locking, audit records, pending/sent/failed states and automatic refund if a payout fails

## Important payment limitation
The deposit form records the user's amount, network and mobile-money number. An automatic USSD/mobile-money payment prompt is not enabled because no approved payment-provider integration and credentials have been connected. The site must not claim that a prompt was sent or collect a MoMo PIN/OTP. Admins can review and approve deposits after verifying payment independently.

Admin payouts reserve funds from the user's withdrawable wallet balance and remain pending until the actual transfer is made through an authorized payment channel. Mark a payout as sent only after the transfer is confirmed.

## Validation
The Next.js production build completed successfully in a Vercel sandbox after the recovery files were added.

## Before production release
- Confirm the existing Neon database schema is compatible with the non-destructive `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` setup in `src/src/lib/db.js`.
- Confirm Vercel has `DATABASE_URL`, `AUTH_SECRET`, and `ADMIN_KEY` (or `ADMIN_ACCESS_KEY`) configured.
- Connect and test an approved Ghana Mobile Money payment provider for automatic deposit prompts and payouts.
- Test registration, login, deposits, investments, withdrawals and admin actions with test accounts before merging to `main`.
