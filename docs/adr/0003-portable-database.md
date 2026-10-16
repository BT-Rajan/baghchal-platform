# ADR 0003: Portable relational database

- Status: accepted
- Date: 2026-10-16

## Context
The team's usual database is MySQL / MariaDB, and we want to keep the freedom to change it.

## Decision
- Data access goes through **SQLAlchemy 2** (async) and schema changes through **Alembic**.
- Supported and tested in CI: **MySQL 8.4**, **MariaDB 11.4** and **SQLite** (development and
  fast tests). Production must use MySQL or MariaDB; the server refuses SQLite there.
- Only portable features are used:
  - standard column types, every string with an explicit length;
  - timestamps stored as UTC with microseconds (`UTCDateTime`), timezone-aware in Python;
  - case-insensitive uniqueness through a normalised column (`username_key`), not collations;
  - MySQL tables created as utf8mb4 with the binary collation, so comparisons are exact;
  - concurrency control with conditional updates (`UPDATE … WHERE …` and the affected row
    count), not database-specific locking;
  - explicit constraint names (naming convention) so migrations behave the same everywhere.
- Migrations are written to run on every supported database (batch mode for SQLite) and the
  test suite builds its schema by running them, then checks that models and migrations agree.

## Consequences
Adding another database (for example PostgreSQL) means adding it to the CI matrix and fixing
whatever that run finds, not rewriting the data layer.
