-- Soft delete для Profile (применено вручную через psql из-за drift с searchVector GENERATED column)

ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Profile_deletedAt_idx" ON "Profile"("deletedAt");
