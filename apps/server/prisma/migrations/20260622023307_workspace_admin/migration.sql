-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "auditRetentionDays" INTEGER,
ADD COLUMN     "defaultRole" "DocRole" NOT NULL DEFAULT 'VIEWER',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);
