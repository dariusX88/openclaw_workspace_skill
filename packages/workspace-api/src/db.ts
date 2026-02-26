import pg from "pg";

export function makeDb(dbUrl: string) {
  const pool = new pg.Pool({ connectionString: dbUrl });
  return {
    pool,
    async q<T = any>(text: string, params: any[] = []) {
      const res = await pool.query(text, params);
      return res.rows as T[];
    },
  };
}
