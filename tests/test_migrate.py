from database.migrate import MIGRATION_SQL


def test_migration_uses_if_not_exists():
    for line in MIGRATION_SQL.split(";"):
        if "CREATE TABLE" in line.upper():
            assert "IF NOT EXISTS" in line.upper(), (
                f"CREATE TABLE without IF NOT EXISTS: {line.strip()[:80]}"
            )


def test_migration_only_creates_acq_tables():
    for line in MIGRATION_SQL.split(";"):
        if "CREATE TABLE" in line.upper():
            assert "acq_" in line.lower(), (
                f"Table created without acq_ prefix: {line.strip()[:80]}"
            )


def test_migration_no_drop_or_alter():
    sql_upper = MIGRATION_SQL.upper()
    assert "DROP " not in sql_upper, "Migration contains DROP statement"
    assert "ALTER " not in sql_upper, "Migration contains ALTER statement"


def test_migration_creates_all_four_tables():
    sql_lower = MIGRATION_SQL.lower()
    assert "acq_leads" in sql_lower
    assert "acq_lead_contacts" in sql_lower
    assert "acq_outreach_log" in sql_lower
    assert "acq_marketing_signals" in sql_lower


def test_migration_has_unique_constraint():
    sql_lower = MIGRATION_SQL.lower()
    assert "platform_source" in sql_lower
    assert "platform_url" in sql_lower
    assert "unique" in sql_lower
