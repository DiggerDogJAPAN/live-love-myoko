PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 1. Update Directus metadata to reflect CASCADE behavior
UPDATE directus_relations 
SET one_deselect_action = 'cascade' 
WHERE many_collection = 'properties_files';

-- 2. Rename existing table
ALTER TABLE properties_files RENAME TO properties_files_old;

-- 3. Create new table with ON DELETE CASCADE constraints
CREATE TABLE "properties_files" (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, 
  `properties_id` integer NULL, 
  `directus_files_id` char(36) NULL, 
  CONSTRAINT `properties_files_properties_id_foreign` FOREIGN KEY (`properties_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE, 
  CONSTRAINT `properties_files_directus_files_id_foreign` FOREIGN KEY (`directus_files_id`) REFERENCES `directus_files` (`id`) ON DELETE CASCADE
);

-- 4. Restore data
INSERT INTO properties_files (id, properties_id, directus_files_id)
SELECT id, properties_id, directus_files_id FROM properties_files_old;

-- 5. Drop old table
DROP TABLE properties_files_old;

COMMIT;

PRAGMA foreign_keys = ON;
