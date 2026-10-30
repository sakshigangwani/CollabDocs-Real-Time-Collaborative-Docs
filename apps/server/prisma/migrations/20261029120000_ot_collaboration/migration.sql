-- OT collaboration: documents carry a step version, comments carry OT-mapped anchors.
ALTER TABLE "Document" ADD COLUMN "otVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Comment" ADD COLUMN "anchorFrom" INTEGER,
ADD COLUMN "anchorTo" INTEGER,
ADD COLUMN "anchorVersion" INTEGER;
