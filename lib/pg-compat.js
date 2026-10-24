import pg from "pg";

const { Pool, types } = pg;

const poolOptions = {
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Включайте DATABASE_SSL=true только для управляемых баз (Yandex Cloud, Selectel и т. п.).
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" }
    : false,
  types: {
    // Поле DATE отдаём строкой «YYYY-MM-DD» (админка сравнивает даты как строки,
    // а объект Date сдвигается по часовому поясу сервера).
    getTypeParser: (oid, format) =>
      oid === 1082 ? (value) => value : types.getTypeParser(oid, format),
  },
};

// Один пул на строку подключения: код вызывает neon(DATABASE_URL) на каждый запрос,
// поэтому пул обязательно переиспользуется, иначе соединения закончатся.
const pools = new Map();

function getPool(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, ...poolOptions });
    // Без обработчика ошибка «простаивающего» соединения роняет весь процесс.
    pool.on("error", (error) => console.error("PostgreSQL pool error:", error.message));
    pools.set(connectionString, pool);
  }
  return pool;
}

function buildQuery(strings, values) {
  let text = "";
  strings.forEach((part, i) => {
    text += part;
    if (i < values.length) text += "$" + (i + 1);
  });
  return { text, values };
}

// Совместимо с: const sql = neon(url); await sql`SELECT ... ${x}`; await sql("SELECT ... $1", [x])
export function neon(connectionString) {
  const pool = getPool(connectionString);
  const sql = async (first, ...rest) => {
    if (Array.isArray(first) && first.raw) {
      const query = buildQuery(first, rest);
      return (await pool.query(query.text, query.values)).rows;
    }
    return (await pool.query(first, rest[0] || [])).rows;
  };
  sql.query = async (text, params = []) => (await pool.query(text, params)).rows;
  return sql;
}

export async function closePools() {
  await Promise.all([...pools.values()].map((pool) => pool.end()));
  pools.clear();
}
