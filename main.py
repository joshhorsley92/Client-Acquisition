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
from database.crm_bridge import push_leads_to_crm, find_deal_for_lead
from outreach.email_sender import EmailSender

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
@click.option("--real", is_flag=True, help="Use browser-based scraping for real sites (requires Chrome)")
@click.option("--visible", is_flag=True, help="Show browser window (for solving CAPTCHAs manually)")
def scrape(source, real, visible):
    """Scrape leads from a source (etsy, kickstarter, county, or all)."""
    db = get_db()
    scrapers = {
        "etsy": lambda: EtsyScraper(db=db),
        "kickstarter": lambda: KickstarterScraper(db=db),
        "county": lambda: CountyRegistryScraper(db=db),
    }

    if real:
        headless = not visible
        if source == "all":
            for name, factory in scrapers.items():
                click.echo(f"Scraping {name} (real, {'headless' if headless else 'visible'})...")
                factory().scrape_real(headless=headless)
        else:
            click.echo(f"Scraping {source} (real, {'headless' if headless else 'visible'})...")
            scrapers[source]().scrape_real(headless=headless)
    else:
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
@click.option("--send", is_flag=True, help="Send emails via Gmail (requires GMAIL_SENDER and GMAIL_APP_PASSWORD in .env)")
def generate(status, lead_id, fmt, send):
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

    if send and fmt in ("both", "email"):
        sender = EmailSender(db=db, config=config)
        if not sender.can_send():
            click.echo("  Note: No Gmail credentials configured. Emails stored as drafts in CRM.")

        # Build list of lead IDs to process
        lead_list = []
        if lead_id:
            lead_list = [lead_id]
        elif status:
            lead_list = [l["id"] for l in db.get_leads_by_status(status)]

        for lid in lead_list:
            deal_id = find_deal_for_lead(db, lid)
            if not deal_id:
                click.echo(f"  Skipping send for {lid}: no CRM deal found")
                continue

            lead_data = db.get_lead_by_id(lid)
            contacts = db.get_contacts_for_lead(lid)
            contact = contacts[0] if contacts else None
            to_email = contact.get("email") if contact else None

            if not to_email:
                click.echo(f"  Skipping send for {lead_data.get('business_name', lid)}: no contact email")
                continue

            signals = db.get_signals_for_lead(lid) or {}
            gen_tmp = OutreachGenerator(db=db, base_url=config["tkbs_base_url"])
            email_html = gen_tmp.generate_email(lead_data, contact, signals)
            subject = f"We noticed {lead_data.get('business_name', 'your business')}"

            contact_id_crm = db.conn.execute(
                "SELECT id FROM contacts WHERE email = ?", (to_email,)
            ).fetchone()
            contact_id_val = (contact_id_crm[0] if isinstance(contact_id_crm, tuple) else contact_id_crm["id"]) if contact_id_crm else None

            result = sender.prepare_and_send(deal_id, contact_id_val, to_email, subject, email_html)
            status_text = "Sent" if result["sent"] else "Stored as draft"
            click.echo(f"  {lead_data.get('business_name', lid)}: {status_text}")

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
