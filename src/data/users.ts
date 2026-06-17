export interface TestUser {
  username: string;
  password: string;
}

export function primaryUser(): TestUser {
  const username = process.env.BERSHKA_USER;
  const password = process.env.BERSHKA_PASS;
  if (!username || !password) {
    throw new Error('BERSHKA_USER and BERSHKA_PASS must be set (no credentials in the repo).');
  }
  return { username, password };
}
