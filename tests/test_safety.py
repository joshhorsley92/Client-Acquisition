import os
import re
import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
PRODUCTION_DIRS = ["scrapers", "enrichment", "outreach", "database"]

def get_python_files():
    files = []
    for dir_name in PRODUCTION_DIRS:
        dir_path = os.path.join(PROJECT_ROOT, dir_name)
        if os.path.exists(dir_path):
            for filename in os.listdir(dir_path):
                if filename.endswith(".py") and filename != "__init__.py":
                    files.append(os.path.join(dir_path, filename))
    for f in ["main.py", "config.py"]:
        fp = os.path.join(PROJECT_ROOT, f)
        if os.path.exists(fp):
            files.append(fp)
    return files

def test_no_delete_calls_in_production_code():
    """Ensure no .delete() calls exist in production code."""
    for filepath in get_python_files():
        with open(filepath, "r") as f:
            content = f.read()
        assert ".delete(" not in content, (
            f"Found .delete() call in {filepath}"
        )

def test_no_drop_statements():
    """Ensure no DROP SQL statements in production code."""
    for filepath in get_python_files():
        with open(filepath, "r") as f:
            content = f.read().upper()
        assert "DROP TABLE" not in content, f"Found DROP TABLE in {filepath}"

def test_no_alter_statements():
    """Ensure no ALTER SQL statements in production code."""
    for filepath in get_python_files():
        with open(filepath, "r") as f:
            content = f.read().upper()
        assert "ALTER TABLE" not in content, f"Found ALTER TABLE in {filepath}"

def test_migration_uses_if_not_exists():
    """All CREATE TABLE statements must use IF NOT EXISTS."""
    from database.migrate import MIGRATION_SQL
    for line in MIGRATION_SQL.split(";"):
        if "CREATE TABLE" in line.upper():
            assert "IF NOT EXISTS" in line.upper()

def test_all_table_references_use_acq_prefix():
    """All SQL table references in the database module use acq_ prefix."""
    db_path = os.path.join(PROJECT_ROOT, "database", "supabase_client.py")
    with open(db_path, "r") as f:
        content = f.read()
    # Find table name strings in SQL
    table_refs = re.findall(r'(?:FROM|INTO|UPDATE|TABLE)\s+(\w+)', content)
    for table in table_refs:
        if table.upper() in ("IF", "NOT", "EXISTS", "SET", "OR", "REPLACE", "CONFLICT", "VALUES", "COALESCE"):
            continue
        assert table.startswith("acq_"), f"Table '{table}' doesn't use acq_ prefix"
