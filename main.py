import logging
import click
from config import load_config
from database.supabase_client import Database
from scrapers.etsy import EtsyScraper
from scrapers.kickstarter import KickstarterScraper
from scrapers.county_registry import CountyRegistryScraper
from enrichment.pipeline import EnrichmentPipeline
from outreach.generator import OutreachGenerator
from database.migrate import run_migration
from database.crm_bridge import push_leads_to_crm

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def get_db():
    config = load_config()
    return Database(config["db_path"])


@click.group()
def cli():
    """TKBS Client Acquisition Tool Suite"""
    pass


@cli.command()
@click.argument("source", type=click.Choice(["etsy", "kickstarter", "county", "all"]))
def scrape(source):
    """Scrape leads from a source (etsy, kickstarter, county, or all)."""
    db = get_db()
    scrapers = {
        "etsy": lambda: EtsyScraper(db=db),
        "kickstarter": lambda: KickstarterScraper(db=db),
        "county": lambda: CountyRegistryScraper(db=db),
    }
    if source == "all":
        for name, factory in scrapers.items():
            click.echo(f"Scraping {name}...")
            factory().scrape()
    else:
        click.echo(f"Scraping {source}...")
        scrapers[source]().scrape()
    click.echo("Scraping complete.")


@cli.command()
@click.option("--lead-id", default=None, help="Enrich a specific lead by ID")
def enrich(lead_id):
    """Enrich leads with contact info and marketing signals."""
    db = get_db()
    pipeline = EnrichmentPipeline(db=db)
    if lead_id:
        click.echo(f"Enriching lead {lead_id}...")
        pipeline.run_single(lead_id)
    else:
        click.echo("Enriching all new leads...")
        pipeline.run()
    click.echo("Enrichment complete.")


@cli.command()
@click.option("--status", default=None, help="Generate for all leads with this status")
@click.option("--lead-id", default=None, help="Generate for a specific lead")
@click.option("--format", "fmt", default="both", type=click.Choice(["mailer", "email", "both"]))
def generate(status, lead_id, fmt):
    """Generate personalized outreach documents."""
    db = get_db()
    config = load_config()
    gen = OutreachGenerator(db=db, base_url=config["tkbs_base_url"])
    if lead_id:
        click.echo(f"Generating {fmt} for lead {lead_id}...")
        results = gen.generate_for_lead(lead_id, format=fmt)
        for doc_type, path in results.items():
            click.echo(f"  {doc_type}: {path}")
    elif status:
        leads = db.get_leads_by_status(status)
        click.echo(f"Generating {fmt} for {len(leads)} {status} leads...")
        for lead in leads:
            results = gen.generate_for_lead(lead["id"], format=fmt)
            click.echo(f"  {lead.get('business_name', lead['id'])}: {list(results.keys())}")
    else:
        click.echo("Specify --status or --lead-id")
    click.echo("Generation complete.")


@cli.command(name="list")
@click.option("--status", required=True, help="Filter leads by status")
def list_leads(status):
    """List leads filtered by status."""
    db = get_db()
    leads = db.get_leads_by_status(status)
    click.echo(f"Found {len(leads)} leads with status '{status}':\n")
    for lead in leads:
        click.echo(f"  [{lead.get('id', '?')[:8]}] {lead.get('business_name', 'Unknown')} "
                   f"({lead.get('platform_source', '?')}) - {lead.get('review_count', '?')} reviews")


@cli.command()
def stats():
    """Show lead counts by status."""
    db = get_db()
    counts = db.get_stats()
    click.echo("Lead Statistics:\n")
    total = 0
    for status, count in sorted(counts.items()):
        click.echo(f"  {status}: {count}")
        total += count
    click.echo(f"\n  Total: {total}")


@cli.command()
@click.option("--lead-id", multiple=True, help="Specific lead IDs to push (can specify multiple)")
@click.option("--owner-id", default=1, type=int, help="CRM user ID to assign deals to")
def push(lead_id, owner_id):
    """Push enriched leads into the CRM pipeline."""
    db = get_db()
    lead_ids = list(lead_id) if lead_id else None

    if lead_ids:
        click.echo(f"Pushing {len(lead_ids)} specific leads to CRM...")
    else:
        click.echo("Pushing all enriched leads to CRM...")

    results = push_leads_to_crm(db, lead_ids=lead_ids, owner_id=owner_id)

    click.echo(f"\nResults:")
    click.echo(f"  Pushed: {results['pushed']}")
    click.echo(f"  Skipped: {results['skipped']}")
    click.echo(f"  Errors: {results['errors']}")


@cli.command()
def migrate():
    """Run database migration to create acq_* tables."""
    db = get_db()
    click.echo("Running migration...")
    run_migration(db)
    click.echo("Migration complete.")


if __name__ == "__main__":
    cli()
