export class DoSqlD1 implements D1Database {
  constructor(private readonly sql: SqlStorage) {}

  prepare(query: string): D1PreparedStatement {
    // @ts-expect-error - we're using a custom implementation
    return new DoSqlD1PreparedStatement(this.sql, query);
  }
  batch<T = unknown>(
    _statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    throw new Error("Method not implemented.");
  }
  async exec(query: string): Promise<D1ExecResult> {
    const result = [...this.sql.exec(query)];
    return {
      count: result.length,
      duration: 0,
    };
  }
  withSession(
    _constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint,
  ): D1DatabaseSession {
    throw new Error("Method not implemented.");
  }
  dump(): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }
}

class DoSqlD1PreparedStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: SqlStorage,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    // @ts-expect-error - custom bind implementation
    return this;
  }

  first<T = unknown>(
    _colName?: unknown,
  ): Promise<T | null> | Promise<T | null> {
    throw new Error("Method not implemented.");
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.all();
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve({
      results: [...this.sql.exec(this.query, ...this.values)] as T[],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
    } satisfies D1Result<T>);
  }

  // @ts-expect-error - not implemented
  raw<T = unknown[]>(
    _options?: unknown,
  ): Promise<[string[], ...T[]]> | Promise<T[]> {
    throw new Error("Method not implemented.");
  }
}
