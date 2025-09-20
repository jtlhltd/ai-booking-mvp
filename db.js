// db.js - Database connection and init

import knex from "knex";

const dbType = process.env.DB_TYPE || "sqlite";

let db;

if (dbType === "postgres") {
  db = knex({
    client: "pg",
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
  });
  console.log("DB: Using Postgres at", process.env.DATABASE_URL);
} else {
  const path = process.env.DB_PATH || "/data/app.db";
  db = knex({
    client: "sqlite3",
    connection: { filename: path },
    useNullAsDefault: true,
  });
  console.log("DB: Using SQLite at " + path);
}

export default db;
