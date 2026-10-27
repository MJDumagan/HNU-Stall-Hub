const crypto = require('crypto');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const pool = require('../config/db');
const { hashPassword } = require('../middleware/auth');

async function ask(question) {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
  }
}

async function main() {
  const schoolId = await ask('Administrator 8-digit School ID: ');
  const fullName = await ask('Administrator full name: ');
  const email = (await ask('Administrator email: ')).toLowerCase();

  if (!/^\d{8}$/.test(schoolId) || !fullName || fullName.length > 160 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter an 8-digit School ID, a name of at most 160 characters, and a valid email address.');
  }

  const password = crypto.randomBytes(24).toString('base64url');
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('stallhub-admin-bootstrap'))");

    const existing = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (existing.rowCount) {
      throw new Error('An administrator account already exists; bootstrap can only be run once.');
    }

    await client.query(
      `INSERT INTO users (school_id, full_name, email, role, password_hash)
       VALUES ($1, $2, $3, 'admin', $4)`,
      [schoolId, fullName, email, hashPassword(password)]
    );
    await client.query('COMMIT');
    transactionStarted = false;

    console.log('\nAdministrator account created. Save this generated password now; it will not be shown again:');
    console.log(password);
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`Administrator bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
