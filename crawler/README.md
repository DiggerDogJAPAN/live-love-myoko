# Myoko Property Crawler

Daily Myoko City Akiya Bank HTML sale-card crawler. PostgreSQL retains inventory,
observations and price/status history between ephemeral GitHub Actions runs.
The website, Access, Hyperdrive and customer eligibility rules are unchanged.
No PDFs or photographs are downloaded. Unknown locations stay Japanese for review.

The workflow runs daily at 06:17 JST and supports **Run workflow** manually.
Scheduled runs may be delayed by GitHub. Errors or partial snapshots leave every
existing property unchanged; a failed run is reported in Actions and, when reachable,
`crawler.crawl_runs`. Complete validated snapshots can mark absent listings
`not_found`, never sold. The existing 25% disappearance guard is retained.

Required repository Actions secrets:
- `MYOKO_CRAWLER_DATABASE_URL`: dedicated `myoko_crawler` Session Pooler URI, port 5432.
- `MYOKO_SUPABASE_PROJECT_REF`: expected project reference.
- `MYOKO_DB_CA_CERT`: trusted CA certificate PEM content (not a path/private key).

Runtime: Python 3.12, `pip install '.[database]'` (Psycopg pinned in setup.cfg).
Local: export database settings and absolute `MYOKO_DB_SSLROOTCERT`, then run
`python -m myoko_property_crawler.daily`. Keep private files outside Git.
For offline checks: `PYTHONPATH=src python -m unittest discover -s tests -t . -q`.
SQL parser tests additionally use `requirements-schema.txt`.

Only crawler code, fixtures and historical design documentation belong here.
Never commit `.env*` credentials, `.venv`, database dumps or `data/`.
The existing `crawl-live`, `sync-db`, fixture and customer-export commands remain.
