const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const COLLAB_URL =
  import.meta.env.VITE_COLLAB_URL ?? "ws://localhost:4001";

export type CollabToken = {
  token: string;
  color: string;
  user: { id: string; name: string };
};

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type DocRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";

export type DocumentDTO = {
  id: string;
  title: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  role?: DocRole;
};

export type FullDocument = DocumentDTO & { content: unknown };

export type Collaborator = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: DocRole;
  isYou: boolean;
};

export type ShareScope = "ANYONE" | "WORKSPACE";

export type ShareLinkDTO = {
  token: string;
  role: DocRole;
  scope: ShareScope;
  hasPassword: boolean;
  expiresAt: string | null;
};

export type AuditEventDTO = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
};

export type ReactionDTO = { emoji: string; count: number; reacted: boolean };

export type CommentAuthor = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  color: string;
};

export type CommentDTO = {
  id: string;
  parentId: string | null;
  body: string;
  anchorStart: string | null;
  anchorEnd: string | null;
  quotedText: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
  reactions: ReactionDTO[];
  replies?: CommentDTO[];
};

export type CommentInput = {
  body: string;
  parentId?: string;
  anchorStart?: string;
  anchorEnd?: string;
  quotedText?: string;
};

export type Mentionable = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  color: string;
};

export type NotificationDTO = {
  id: string;
  type: string;
  documentId: string | null;
  documentTitle: string | null;
  commentId: string | null;
  snippet: string | null;
  read: boolean;
  createdAt: string;
  actor: { id: string; name: string; email: string; avatarUrl: string | null } | null;
};

export type NotificationPrefs = { emailInstant: boolean; digest: "off" | "daily" | "weekly" };
export type SubscriptionLevel = "all" | "mentions" | "none";

export type VersionAuthor = { id: string; name: string; color: string } | null;

export type VersionMeta = {
  id: string;
  label: string | null;
  kind: "auto" | "named";
  createdAt: string;
  author: VersionAuthor;
};

export type VersionFull = VersionMeta & { content: unknown };

export type SharedLinkInfo = {
  document: { id: string; title: string; icon: string | null };
  role: DocRole;
  scope: ShareScope;
  requiresPassword: boolean;
  signedIn: boolean;
};

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
    collabToken: async (id: string): Promise<CollabToken> => {
      return request("GET", `/api/v1/documents/${id}/collab-token`);
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
    getSubscription: async (id: string): Promise<SubscriptionLevel> => {
      const data = await request("GET", `/api/v1/documents/${id}/subscription`);
      return data.level;
    },
    setSubscription: async (id: string, level: SubscriptionLevel): Promise<SubscriptionLevel> => {
      const data = await request("PUT", `/api/v1/documents/${id}/subscription`, { level });
      return data.level;
    },
  },

  shares: {
    list: async (
      docId: string
    ): Promise<{ collaborators: Collaborator[]; link: ShareLinkDTO | null }> => {
      return request("GET", `/api/v1/documents/${docId}/shares`);
    },
    invite: async (
      docId: string,
      email: string,
      role: DocRole
    ): Promise<{ collaborator: Collaborator }> => {
      return request("POST", `/api/v1/documents/${docId}/shares`, { email, role });
    },
    setRole: (docId: string, userId: string, role: DocRole) =>
      request("PATCH", `/api/v1/documents/${docId}/shares/${userId}`, { role }),
    remove: (docId: string, userId: string) =>
      request("DELETE", `/api/v1/documents/${docId}/shares/${userId}`),
    audit: async (docId: string): Promise<AuditEventDTO[]> => {
      const data = await request("GET", `/api/v1/documents/${docId}/audit`);
      return data.events;
    },
  },

  shareLink: {
    save: async (
      docId: string,
      body: {
        role?: DocRole;
        scope?: ShareScope;
        expiresInDays?: number | null;
        password?: string | null;
        regenerate?: boolean;
      }
    ): Promise<ShareLinkDTO> => {
      const data = await request("PUT", `/api/v1/documents/${docId}/share-link`, body);
      return data.link;
    },
    revoke: (docId: string) =>
      request("DELETE", `/api/v1/documents/${docId}/share-link`),
  },

  comments: {
    list: async (docId: string): Promise<CommentDTO[]> => {
      const data = await request("GET", `/api/v1/documents/${docId}/comments`);
      return data.comments;
    },
    create: async (docId: string, input: CommentInput): Promise<CommentDTO> => {
      const data = await request("POST", `/api/v1/documents/${docId}/comments`, input);
      return data.comment;
    },
    update: async (
      docId: string,
      commentId: string,
      patch: { body?: string; resolved?: boolean }
    ): Promise<CommentDTO> => {
      const data = await request(
        "PATCH",
        `/api/v1/documents/${docId}/comments/${commentId}`,
        patch
      );
      return data.comment;
    },
    remove: (docId: string, commentId: string) =>
      request("DELETE", `/api/v1/documents/${docId}/comments/${commentId}`),
    react: (docId: string, commentId: string, emoji: string) =>
      request("POST", `/api/v1/documents/${docId}/comments/${commentId}/reactions`, { emoji }),
    mentionable: async (docId: string): Promise<Mentionable[]> => {
      const data = await request("GET", `/api/v1/documents/${docId}/mentionable`);
      return data.users;
    },
  },

  notifications: {
    list: async (): Promise<{ notifications: NotificationDTO[]; unreadCount: number }> =>
      request("GET", "/api/v1/notifications"),
    markRead: (ids?: string[]) =>
      request("POST", "/api/v1/notifications/read", ids ? { ids } : {}),
    getPrefs: async (): Promise<NotificationPrefs> =>
      request("GET", "/api/v1/notifications/preferences"),
    setPrefs: async (patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> =>
      request("PUT", "/api/v1/notifications/preferences", patch),
    sendTestDigest: (): Promise<{ ok: boolean; sent?: number; empty?: boolean }> =>
      request("POST", "/api/v1/notifications/digest/test", {}),
  },

  versions: {
    list: async (docId: string): Promise<VersionMeta[]> => {
      const data = await request("GET", `/api/v1/documents/${docId}/versions`);
      return data.versions;
    },
    get: async (docId: string, vid: string): Promise<VersionFull> => {
      const data = await request("GET", `/api/v1/documents/${docId}/versions/${vid}`);
      return data.version;
    },
    create: async (
      docId: string,
      input: { content: unknown; label?: string; kind: "auto" | "named" }
    ): Promise<{ version?: VersionMeta; deduped?: boolean }> =>
      request("POST", `/api/v1/documents/${docId}/versions`, input),
    restore: async (docId: string, vid: string): Promise<unknown> => {
      const data = await request("POST", `/api/v1/documents/${docId}/versions/${vid}/restore`);
      return data.content;
    },
  },

  shared: {
    get: (token: string): Promise<SharedLinkInfo> =>
      request("GET", `/api/v1/shared/${token}`) as Promise<SharedLinkInfo>,
    claim: async (token: string, password?: string): Promise<string> => {
      const data = await request(
        "POST",
        `/api/v1/shared/${token}/claim`,
        password !== undefined ? { password } : {}
      );
      return data.documentId;
    },
  },
};

export const oauthUrl = (provider: "google" | "github") =>
  `${API_URL}/api/v1/auth/${provider}`;
