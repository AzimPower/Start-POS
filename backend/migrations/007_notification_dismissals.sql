CREATE TABLE IF NOT EXISTS `notification_dismissals` (
  `id` varchar(36) NOT NULL,
  `notificationId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `dismissedAt` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_notification_dismissal_user` (`notificationId`,`userId`),
  KEY `idx_notification_dismissals_userId` (`userId`),
  KEY `idx_notification_dismissals_notificationId` (`notificationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;