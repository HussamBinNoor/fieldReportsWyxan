import { open, type DB } from '@op-engineering/op-sqlite';
import { SCHEMA_STATEMENTS } from './schema';

let database: DB | null = null;

export function getDatabase(): DB {
  if (!database) {
    throw new Error('The local database is not open.');
  }
  return database;
}

export async function initDatabase(): Promise<void> {
  if (database) {
    return;
  }
  database = open({ name: 'field-reports.db' });
  await database.execute('PRAGMA foreign_keys = ON');
  await migrate(database);
}

async function migrate(db: DB): Promise<void> {
  const current = await db.execute('PRAGMA user_version');
  const version = Number(current.rows[0]?.user_version ?? 0);
  if (version >= 1) {
    return;
  }
  await db.transaction(async tx => {
    for (const statement of SCHEMA_STATEMENTS) {
      await tx.execute(statement);
    }
  });
  await db.execute('PRAGMA user_version = 1');
}
