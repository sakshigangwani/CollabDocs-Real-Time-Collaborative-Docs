// Imported first by every bench script: refuse to touch anything but the bench DB.
// (`node --env-file=.env` would otherwise pick up the dev DATABASE_URL.)
if (!/\/collabdocs_bench(\?|$)/.test(process.env.DATABASE_URL ?? "")) {
  console.error(`Refusing to run: DATABASE_URL must point at collabdocs_bench (got ${process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@")})`);
  process.exit(1);
}
