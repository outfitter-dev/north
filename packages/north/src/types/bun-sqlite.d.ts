declare module "bun:sqlite" {
  export interface Statement<
    BindParameters extends unknown[] | Record<string, unknown> = unknown[],
    Result = unknown,
  > {
    run(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
    get(
      ...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]
    ): Result | undefined;
    all(...params: BindParameters extends unknown[] ? BindParameters : [BindParameters]): Result[];
  }

  export class Database {
    constructor(filename?: string);
    prepare<
      BindParameters extends unknown[] | Record<string, unknown> = unknown[],
      Result = unknown,
    >(sql: string): Statement<BindParameters, Result>;
    exec(sql: string): this;
    run(
      sql: string,
      ...params: unknown[]
    ): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
    close(): void;
    transaction<T>(fn: () => T): () => T;
  }
}
