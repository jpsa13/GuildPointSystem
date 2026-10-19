-- Stealer and Artist got new .jpg portraits like the other Cora classes (were .gif).
UPDATE character_class
SET image_url = '/classes/stealer.jpg'
WHERE name = 'Stealer'
  AND race_id = (SELECT id FROM game_race WHERE name = 'Cora');

UPDATE character_class
SET image_url = '/classes/artist.jpg'
WHERE name = 'Artist'
  AND race_id = (SELECT id FROM game_race WHERE name = 'Cora');
