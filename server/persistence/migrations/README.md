# Database migrations

Business collections are introduced with their modules, using the schema and indexes in Database Design. No business data is seeded by the foundation.

Add an ES module named `YYYYMMDDHHmmss-description.js` exporting `async function up(db)`. Use a JSDoc `import('mongoose').mongo.Db` parameter type. Each migration must check its preconditions, create or verify validators/indexes explicitly, and be safe to rerun after partial failure. Compare existing index keys/options; stop on conflicting definitions or duplicate data. Do not silently drop indexes, delete duplicates or overwrite published revisions.

Run `npm run db:status`, then `npm run db:migrate` against the intended database. Applied files are recorded with a SHA-256 checksum and must never be edited or removed. Add a forward migration for changes. A database lock prevents concurrent migration runners. If a process is killed, inspect the migration and ensure no runner is active before removing `_migration_lock` document `exclusive`; rerun the idempotent migration.

Collection/index DDL is not wrapped in a transaction. Multi-document data changes can use a separate short transaction with primary/snapshot/majority settings. Do not call external services inside a transaction. Back up persistent data before changing it. Application startup never runs migrations or creates indexes automatically.
