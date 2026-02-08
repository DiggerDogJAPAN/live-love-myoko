UPDATE directus_fields 
SET special = 'cast-json' 
WHERE collection = 'properties' AND field = 'amenities';
