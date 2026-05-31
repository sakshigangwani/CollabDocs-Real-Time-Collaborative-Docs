import { Google, GitHub } from "arctic";

export function getGoogle(): Google | null {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redirect) return null;
  return new Google(id, secret, redirect);
}

export function getGitHub(): GitHub | null {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  const redirect = process.env.GITHUB_REDIRECT_URI;
  if (!id || !secret || !redirect) return null;
  return new GitHub(id, secret, redirect);
}

export function oauthCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: 60 * 10,
  };
}
