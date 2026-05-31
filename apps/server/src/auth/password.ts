import { hash, verify } from "@node-rs/argon2";

const options = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  return verify(storedHash, plain, options);
}
