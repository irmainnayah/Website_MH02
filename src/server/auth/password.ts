// Password hashing with bcrypt (design: argon2id or bcrypt; never plaintext).

import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

// Used when the account does not exist, so the response time does not reveal which NRPs exist.
const DUMMY_HASH = bcrypt.hashSync("mh02-dummy-password-not-a-real-account", COST);

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash ?? DUMMY_HASH);
  } catch {
    // A malformed hash (for example the dev seed actor's placeholder) never authenticates.
    return false;
  }
}
