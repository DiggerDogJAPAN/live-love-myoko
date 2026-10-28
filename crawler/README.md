# Myoko Property Crawler

Daily source-isolated HTML crawlers for Myoko City and Shinano Town Akiya Banks. PostgreSQL retains inventory,
observations and price/status history between ephemeral GitHub Actions runs.
Myoko eligibility remains unchanged. Shinano requires unrestricted building-sale listings.
Website implementation is a separate handoff; Access and Hyperdrive are unchanged.
No PDFs or photographs are downloaded. Unknown locations stay Japanese for review.

The workflow runs daily at 06:17 JST and supports **Run workflow** manually.
Both execution modes run **Myoko and Shinano** independently. Joetsu is implemented
but remains disabled pending website deployment verification and activation approval.
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
`python -m myoko_property_crawler.daily --source myoko_akiya_bank`.
Shinano uses `--source shinano_akiya_bank`. Joetsu uses `--source joetsu_akiya_bank` only
after its provisioned source is explicitly enabled following approval. Keep private files outside Git.
For offline checks: `PYTHONPATH=src python -m unittest discover -s tests -t . -q`.
SQL parser tests additionally use `requirements-schema.txt`.

Only crawler code, fixtures and historical design documentation belong here.
Never commit `.env*` credentials, `.venv`, database dumps or `data/`.
**Joetsu activation is pending:** migration 004 is installed and verified in production; the source is disabled,
and the workflow matrix still contains Myoko/Shinano only. No Joetsu photos are public.
See [Joetsu implementation, migration and website handoff](docs/joetsu-handoff.md).

The existing `crawl-live`, `sync-db`, fixture and customer-export commands remain.
