const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {

    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  signup: (body: { email: string; name: string; password: string }) =>
    post("/api/v1/auth/signup", body) as Promise<{ user: User }>,

  login: (body: { email: string; password: string }) =>
    post("/api/v1/auth/login", body) as Promise<{ user: User }>,

  logout: () => post("/api/v1/auth/logout", {}),

  me: async (): Promise<User | null> => {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({ user: null }));
    return data.user ?? null;
  },
};

export const oauthUrl = (provider: "google" | "github") =>
  `${API_URL}/api/v1/auth/${provider}`;
