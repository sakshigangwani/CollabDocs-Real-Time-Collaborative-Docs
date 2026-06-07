import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export type AuditInput = {
  documentId?: string;
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAudit(input: AuditInput) {
  await prisma.auditEvent
    .create({
      data: {
        documentId: input.documentId,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
    })
    .catch(() => {});
}
