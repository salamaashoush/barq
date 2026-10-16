interface Pool {
  readonly url: string;
  query(sql: string): string[];
}

// One pool per process, kept on the global so a reload does not open a second.
// The write is a side effect, which is what every real driver module has.
const pools = ((globalThis as { acmePools?: Pool[] }).acmePools ??= []);

export const db: Pool = {
  url: "postgres://app@db.internal.example.com/db-module-must-not-ship",
  query: (sql) => [sql],
};

pools.push(db);
