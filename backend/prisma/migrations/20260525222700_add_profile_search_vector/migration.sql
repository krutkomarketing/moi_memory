-- Полнотекстовый поиск по профилям (русский стеммер)
-- fullName    → вес A (самое релевантное)
-- bio         → вес B
-- burialPlace → вес C

ALTER TABLE "Profile"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce("fullName",    '')), 'A') ||
    setweight(to_tsvector('russian', coalesce("bio",         '')), 'B') ||
    setweight(to_tsvector('russian', coalesce("burialPlace", '')), 'C')
  ) STORED;

CREATE INDEX "Profile_searchVector_idx"
  ON "Profile"
  USING GIN ("searchVector");
