-- Cascade FK для ProfileAccessCode -> Profile (применён вручную через psql из-за drift с searchVector GENERATED column)

ALTER TABLE "ProfileAccessCode" DROP CONSTRAINT IF EXISTS "ProfileAccessCode_profileId_fkey";
ALTER TABLE "ProfileAccessCode"
    ADD CONSTRAINT "ProfileAccessCode_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
