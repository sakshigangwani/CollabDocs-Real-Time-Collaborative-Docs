const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type DocumentDTO = {
  id: string;
  title: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FullDocument = DocumentDTO & { content: unknown };

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  signup: (body: { email: string; name: string; password: string }) =>
    request("POST", "/api/v1/auth/signup", body) as Promise<{ user: User }>,

  login: (body: { email: string; password: string }) =>
    request("POST", "/api/v1/auth/login", body) as Promise<{ user: User }>,

  logout: () => request("POST", "/api/v1/auth/logout", {}),

  me: async (): Promise<User | null> => {
    const data = await request("GET", "/api/v1/auth/me");
    return data.user ?? null;
  },

  documents: {
    list: async (): Promise<DocumentDTO[]> => {
      const data = await request("GET", "/api/v1/documents");
      return data.documents;
    },
    create: async (title?: string): Promise<DocumentDTO> => {
      const data = await request("POST", "/api/v1/documents", title ? { title } : {});
      return data.document;
    },
    get: async (id: string): Promise<FullDocument> => {
      const data = await request("GET", `/api/v1/documents/${id}`);
      return data.document;
    },
    update: async (
      id: string,
      patch: { title?: string; content?: unknown }
    ): Promise<FullDocument> => {
      const data = await request("PATCH", `/api/v1/documents/${id}`, patch);
      return data.document;
    },
    rename: async (id: string, title: string): Promise<DocumentDTO> => {
      const data = await request("PATCH", `/api/v1/documents/${id}`, { title });
      return data.document;
    },
    remove: (id: string) => request("DELETE", `/api/v1/documents/${id}`),

    listTrash: async (): Promise<DocumentDTO[]> => {
      const data = await request("GET", "/api/v1/documents/trash");
      return data.documents;
    },
    restore: async (id: string): Promise<DocumentDTO> => {
      const data = await request("POST", `/api/v1/documents/${id}/restore`);
      return data.document;
    },
    destroy: (id: string) =>
      request("DELETE", `/api/v1/documents/${id}/permanent`),
  },
};

export const oauthUrl = (provider: "google" | "github") =>
  `${API_URL}/api/v1/auth/${provider}`;
