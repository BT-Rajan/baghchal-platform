-- Bagh Chal (bhagchal2): database, tables (schema version 0009) and the first accounts.
-- Needs MariaDB 10.7 or newer (uuid columns).
CREATE DATABASE IF NOT EXISTS `bhagchal2` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bhagchal2;
SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE IF NOT EXISTS `active_games` (
  `user_id` uuid NOT NULL,
  `game_id` uuid NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `ix_active_games_game_id` (`game_id`),
  CONSTRAINT `fk_active_games_game_id_games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_active_games_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `blocks` (
  `blocker_id` uuid NOT NULL,
  `blocked_id` uuid NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`blocker_id`,`blocked_id`),
  KEY `ix_blocks_blocked_id` (`blocked_id`),
  CONSTRAINT `fk_blocks_blocked_id_users` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_blocks_blocker_id_users` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `challenges` (
  `id` uuid NOT NULL,
  `challenger_id` uuid NOT NULL,
  `opponent_id` uuid NOT NULL,
  `pair_key` varchar(73) DEFAULT NULL,
  `initial_seconds` int(11) NOT NULL,
  `increment_seconds` int(11) NOT NULL,
  `rated` tinyint(1) NOT NULL,
  `challenger_side` varchar(8) DEFAULT NULL,
  `status` varchar(16) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `responded_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_challenges_pair_key` (`pair_key`),
  KEY `ix_challenges_challenger_id_status` (`challenger_id`,`status`),
  KEY `ix_challenges_opponent_id_status` (`opponent_id`,`status`),
  CONSTRAINT `fk_challenges_challenger_id_users` FOREIGN KEY (`challenger_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_challenges_opponent_id_users` FOREIGN KEY (`opponent_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `email_tokens` (
  `token_hash` varchar(64) NOT NULL,
  `user_id` uuid NOT NULL,
  `purpose` varchar(16) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `used_at` datetime(6) DEFAULT NULL,
  `new_email` varchar(254) DEFAULT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_email_tokens_user_id` (`user_id`),
  CONSTRAINT `fk_email_tokens_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `game_moves` (
  `game_id` uuid NOT NULL,
  `ply` int(11) NOT NULL,
  `notation` varchar(8) NOT NULL,
  `played_at` datetime(6) NOT NULL,
  `think_ms` int(11) NOT NULL,
  `clock_ms` int(11) NOT NULL,
  PRIMARY KEY (`game_id`,`ply`),
  CONSTRAINT `fk_game_moves_game_id_games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `games` (
  `id` uuid NOT NULL,
  `challenge_id` uuid DEFAULT NULL,
  `goat_id` uuid NOT NULL,
  `tiger_id` uuid NOT NULL,
  `rated` tinyint(1) NOT NULL,
  `initial_ms` int(11) NOT NULL,
  `increment_ms` int(11) NOT NULL,
  `status` varchar(16) NOT NULL,
  `winner` varchar(8) DEFAULT NULL,
  `end_reason` varchar(16) DEFAULT NULL,
  `ply` int(11) NOT NULL,
  `position` varchar(40) NOT NULL,
  `goat_ms` int(11) NOT NULL,
  `tiger_ms` int(11) NOT NULL,
  `turn_started_at` datetime(6) NOT NULL,
  `deadline_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `finished_at` datetime(6) DEFAULT NULL,
  `match_id` uuid DEFAULT NULL,
  `match_game` int(11) DEFAULT NULL,
  `goat_rating` int(11) NOT NULL,
  `tiger_rating` int(11) NOT NULL,
  `goat_rating_change` int(11) DEFAULT NULL,
  `tiger_rating_change` int(11) DEFAULT NULL,
  `lag_ms` int(11) NOT NULL,
  `aborted_by` uuid DEFAULT NULL,
  `bot_level` varchar(8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_games_challenge_id` (`challenge_id`),
  KEY `ix_games_goat_id` (`goat_id`),
  KEY `ix_games_status_deadline_at` (`status`,`deadline_at`),
  KEY `ix_games_tiger_id` (`tiger_id`),
  KEY `ix_games_match_id` (`match_id`),
  KEY `ix_games_aborted_by_finished_at` (`aborted_by`,`finished_at`),
  CONSTRAINT `fk_games_aborted_by_users` FOREIGN KEY (`aborted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_games_challenge_id_challenges` FOREIGN KEY (`challenge_id`) REFERENCES `challenges` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_games_goat_id_users` FOREIGN KEY (`goat_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_games_match_id_matches` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_games_tiger_id_users` FOREIGN KEY (`tiger_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `matches` (
  `id` uuid NOT NULL,
  `challenge_id` uuid NOT NULL,
  `status` varchar(16) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `finished_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_matches_challenge_id` (`challenge_id`),
  CONSTRAINT `fk_matches_challenge_id_challenges` FOREIGN KEY (`challenge_id`) REFERENCES `challenges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `moderation_actions` (
  `id` uuid NOT NULL,
  `moderator_id` uuid DEFAULT NULL,
  `target_id` uuid NOT NULL,
  `action` varchar(16) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_moderation_actions_moderator_id_users` (`moderator_id`),
  KEY `ix_moderation_actions_target_id_created_at` (`target_id`,`created_at`),
  CONSTRAINT `fk_moderation_actions_moderator_id_users` FOREIGN KEY (`moderator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_moderation_actions_target_id_users` FOREIGN KEY (`target_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `ratings` (
  `user_id` uuid NOT NULL,
  `category` varchar(8) NOT NULL,
  `rating` float NOT NULL,
  `deviation` float NOT NULL,
  `volatility` float NOT NULL,
  `games` int(11) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`user_id`,`category`),
  KEY `ix_ratings_category_rating` (`category`,`rating`),
  CONSTRAINT `fk_ratings_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `reports` (
  `id` uuid NOT NULL,
  `reporter_id` uuid NOT NULL,
  `target_id` uuid NOT NULL,
  `game_id` uuid DEFAULT NULL,
  `reason` varchar(16) NOT NULL,
  `details` varchar(1000) NOT NULL,
  `status` varchar(16) NOT NULL,
  `open_key` varchar(73) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `resolved_at` datetime(6) DEFAULT NULL,
  `resolved_by` uuid DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reports_open_key` (`open_key`),
  KEY `fk_reports_game_id_games` (`game_id`),
  KEY `fk_reports_resolved_by_users` (`resolved_by`),
  KEY `ix_reports_reporter_id` (`reporter_id`),
  KEY `ix_reports_status_created_at` (`status`,`created_at`),
  KEY `ix_reports_target_id_status` (`target_id`,`status`),
  CONSTRAINT `fk_reports_game_id_games` FOREIGN KEY (`game_id`) REFERENCES `games` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_reporter_id_users` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_resolved_by_users` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_target_id_users` FOREIGN KEY (`target_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `seeks` (
  `user_id` uuid NOT NULL,
  `initial_seconds` int(11) NOT NULL,
  `increment_seconds` int(11) NOT NULL,
  `rated` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `ix_seeks_kind` (`initial_seconds`,`increment_seconds`,`rated`,`created_at`),
  CONSTRAINT `fk_seeks_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash` varchar(64) NOT NULL,
  `user_id` uuid NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `last_used_at` datetime(6) NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_sessions_user_id` (`user_id`),
  CONSTRAINT `fk_sessions_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `users` (
  `id` uuid NOT NULL,
  `username` varchar(20) NOT NULL,
  `username_key` varchar(20) NOT NULL,
  `email` varchar(254) NOT NULL,
  `email_key` varchar(254) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `email_verified_at` datetime(6) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `deleted_at` datetime(6) DEFAULT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'player',
  `suspended_until` datetime(6) DEFAULT NULL,
  `suspension_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email_key` (`email_key`),
  UNIQUE KEY `uq_users_username_key` (`username_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- Tells ./runonce.sh these tables are up to date, so it adds only later changes.
INSERT IGNORE INTO alembic_version (version_num) VALUES ('0009');
SET FOREIGN_KEY_CHECKS = 1;

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
