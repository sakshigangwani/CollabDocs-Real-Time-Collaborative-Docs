-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "emailInstant" BOOLEAN NOT NULL DEFAULT true,
    "digest" TEXT NOT NULL DEFAULT 'off',
    "lastDigestAt" TIMESTAMP(3),

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DocumentSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'mentions',

    CONSTRAINT "DocumentSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSubscription_documentId_idx" ON "DocumentSubscription"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSubscription_userId_documentId_key" ON "DocumentSubscription"("userId", "documentId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubscription" ADD CONSTRAINT "DocumentSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubscription" ADD CONSTRAINT "DocumentSubscription_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
