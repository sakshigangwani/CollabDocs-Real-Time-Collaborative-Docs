import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { prisma } from "./db.js";
import { roleAtLeast } from "./permissions.js";
import { verifyCollabToken } from "./auth/collab-token.js";

type CollabContext = {
  userId: string;
  name: string;
  role: string;
};

export function createCollabServer() {
  return new Server({
    name: "collabdocs-collab",
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,

    async onAuthenticate({ token, documentName, connectionConfig }) {
      const claims = await verifyCollabToken(token);

      if (claims.docId !== documentName) {
        throw new Error("Token does not grant access to this document.");
      }
      if (!roleAtLeast(claims.role, "VIEWER")) {
        throw new Error("You don't have access to this document.");
      }

      if (!roleAtLeast(claims.role, "EDITOR")) {
        connectionConfig.readOnly = true;
      }

      return {
        userId: claims.sub,
        name: claims.name,
        role: claims.role,
      } satisfies CollabContext;
    },

    async onLoadDocument({ documentName, document }) {
      const row = await prisma.document.findUnique({
        where: { id: documentName },
        select: { ydoc: true },
      });
      if (row?.ydoc) {
        Y.applyUpdate(document, new Uint8Array(row.ydoc));
      }
      return document;
    },

    async onStoreDocument({ documentName, document }) {
      const state = Buffer.from(Y.encodeStateAsUpdate(document));
      await prisma.document.update({
        where: { id: documentName },
        data: { ydoc: state, updatedAt: new Date() },
      });
    },
  });
}
