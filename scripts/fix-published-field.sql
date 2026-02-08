UPDATE directus_fields 
SET special = 'cast-boolean' 
WHERE collection = 'properties' AND field = 'published';
