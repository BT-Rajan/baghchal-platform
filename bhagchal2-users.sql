-- Bagh Chal (bhagchal2): one moderator (admin) and four players, emails already confirmed.
-- Passwords are stored as argon2id hashes, as the server does. Safe to run again: an
-- existing name gets its password and role reset.
USE bhagchal2;
INSERT INTO users (id, username, username_key, email, email_key, password_hash,
                   email_verified_at, is_active, role, created_at, updated_at)
VALUES
  ('0df71377115c44e48264a83d4e8c9ae4', 'admin', 'admin', 'admin@bhagchal2.local', 'admin@bhagchal2.local',
   '$argon2id$v=19$m=65536,t=3,p=4$BjZBWYD5S9q8Xw4mf5zX1A$HdyG8eldW2+LM0r7tkEHXxl/XVz5NvETyoJ7v6izEts',
   UTC_TIMESTAMP(6), 1, 'moderator', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
  ('ac7f8372e3ce4ef8b0f906608322f34f', 'Arun', 'arun', 'arun@bhagchal2.local', 'arun@bhagchal2.local',
   '$argon2id$v=19$m=65536,t=3,p=4$N+yS6/qNTQIHA0xYoccg3Q$XrdpJgpoPpMrOMGnXbQC0ODFXkhS9K2gc5YOPELYB2g',
   UTC_TIMESTAMP(6), 1, 'player', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
  ('78ef963e87fd4c759d3fee00a3440d59', 'babu', 'babu', 'babu@bhagchal2.local', 'babu@bhagchal2.local',
   '$argon2id$v=19$m=65536,t=3,p=4$0ydFVmaUDZZgVhE2VhtDHg$o4ANk9sZOh9mn//fKyfWSXmWed8u30byVc3djZZDTk8',
   UTC_TIMESTAMP(6), 1, 'player', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
  ('b8e96d18f1ea42f382e7b885e35e85e6', 'chola', 'chola', 'chola@bhagchal2.local', 'chola@bhagchal2.local',
   '$argon2id$v=19$m=65536,t=3,p=4$W6Pys4La5OIAdwXdf8tC4A$AHxqhZUHZpAtmWD8o7txVYs2F8xqFYEtlHvn0x1dUj4',
   UTC_TIMESTAMP(6), 1, 'player', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
  ('b53181fb186849a182f67d3501a81c07', 'danny', 'danny', 'danny@bhagchal2.local', 'danny@bhagchal2.local',
   '$argon2id$v=19$m=65536,t=3,p=4$tfgkx1Fx/B7HGG4t9oUUjw$uwryKfJhNx9KRARUcMvzq8T4U74iXV84n5GpRQjs3qM',
   UTC_TIMESTAMP(6), 1, 'player', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role),
  is_active = 1, email_verified_at = COALESCE(email_verified_at, VALUES(email_verified_at)),
  updated_at = VALUES(updated_at);
