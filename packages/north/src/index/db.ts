export interface IndexStatement<
  BindParameters extends unknown[] | Record<string, unknown> = unknown[],
  Result = unknown,
> {
  run(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): unknown;
  get(
    ...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]
  ): Result | undefined;
  all(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): Result[];
}

export interface IndexDatabase {
  prepare<BindParameters extends unknown[] | Record<string, unknown> = unknown[], Result = unknown>(
    sql: string
  ): IndexStatement<BindParameters, Result>;
  exec(sql: string): unknown;
  close(): void;
}

type DatabaseConstructor = new (path?: string) => IndexDatabase;

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

async function loadDatabaseConstructor(): Promise<DatabaseConstructor> {
  if (isBunRuntime()) {
    const bunSqlite = await import("bun:sqlite");
    return bunSqlite.Database as unknown as DatabaseConstructor;
  }

  const module = await import("better-sqlite3");
  const Database =
    (module as unknown as { default?: DatabaseConstructor }).default ??
    (module as unknown as DatabaseConstructor);
  return Database as DatabaseConstructor;
}

export async function openIndexDatabase(path: string): Promise<IndexDatabase> {
  const Database = await loadDatabaseConstructor();
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA auto_vacuum = NONE");
  return db;
}
