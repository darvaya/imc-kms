// Load .env file so sequelize-cli picks up DATABASE_URL / DATABASE_* vars
// when invoked directly (e.g. `yarn db:migrate`), without going through the
// app's bootstrap. Matches options used in server/scripts/bootstrap.ts.
require("@dotenvx/dotenvx").config({
  silent: true,
  ignore: ["MISSING_ENV_FILE"],
});

const shared = {
  use_env_variable: process.env.DATABASE_URL ? "DATABASE_URL" : undefined,
  dialect: "postgres",
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD || undefined,
  database: process.env.DATABASE_NAME,
};

module.exports = {
  development: shared,
  test: shared,
  "production-ssl-disabled": shared,
  production: {
    ...shared,
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false,
      },
    },
  },
};
