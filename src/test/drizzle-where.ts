import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

export type CompiledWhere = {
  sql: string;
  params: unknown[];
};

/**
 * Compiles a Drizzle `where` clause down to SQL text and bound parameters.
 *
 * Ownership checks live in the query predicate rather than in a comparison
 * made after the row is read, so tests need to assert on the SQL that will
 * actually reach Postgres. Checking only that a row came back would test the
 * mock rather than the code.
 */
export function compileWhere(clause: SQL | undefined): CompiledWhere {
  if (!clause) return { sql: '', params: [] };

  const { sql, params } = dialect.sqlToQuery(clause);

  return { sql, params };
}

/** True when the compiled predicate constrains the given column. */
export function constrainsColumn(clause: SQL | undefined, column: string) {
  return compileWhere(clause).sql.includes(`"${column}"`);
}
