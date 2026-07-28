# ScholarReach AI

Commercial student cold-email SaaS — discover R1 faculty, verify emails, approve drafts, and drip-dispatch via Gmail OAuth during the Tue–Thu 8–9 AM academic window.

## Design

**Dawn Correspondence Desk** — ink navy + sealing-wax copper, Fraunces display + Plus Jakarta Sans, shadcn/ui (base-nova) + Framer Motion. Signature UI: the animated **8 AM academic window seal**.

## Local (full API + Prisma)

```bash
npm install
npm run db:setup
npm run demo:export
npm run drip:dry-run
npm run dev   # http://localhost:3001
```

## Static GitHub Pages build

```bash
npm run build:gh-pages   # writes /out (basePath /scholarreach-ai)
```

## Deploy to GitHub Pages

```bash
gh auth login
gh repo create scholarreach-ai --public --source=. --remote=origin --push
gh api -X PUT repos/{owner}/scholarreach-ai/pages -f build_type=workflow
```

Or push to `main`/`master` — `.github/workflows/deploy-pages.yml` builds and publishes automatically.

Site URL: `https://<you>.github.io/scholarreach-ai/`

## Notes

- Root professor_outreach automation files are untouched; this app lives in `saas_platform/`.
- GitHub Pages hosts the **static demo** (seeded snapshot). Live Gmail/mining APIs run via `npm run dev`.
