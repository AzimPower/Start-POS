CREATE TABLE IF NOT EXISTS `notifications` (
  `id` varchar(36) NOT NULL,
  `title` varchar(160) NOT NULL,
  `message` text NOT NULL,
  `type` enum('info','success','warning','critical') NOT NULL DEFAULT 'info',
  `targetType` enum('all','role','store','user') NOT NULL,
  `targetRole` enum('super_admin','manager','admin','cashier') DEFAULT NULL,
  `targetStoreId` varchar(36) DEFAULT NULL,
  `targetUserId` varchar(36) DEFAULT NULL,
  `senderUserId` varchar(36) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `expiresAt` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_createdAt` (`createdAt`),
  KEY `idx_notifications_targetType` (`targetType`),
  KEY `idx_notifications_targetRole` (`targetRole`),
  KEY `idx_notifications_targetStoreId` (`targetStoreId`),
  KEY `idx_notifications_targetUserId` (`targetUserId`),
  KEY `idx_notifications_senderUserId` (`senderUserId`),
  KEY `idx_notifications_active_expires` (`active`,`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_reads` (
  `id` varchar(36) NOT NULL,
  `notificationId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `readAt` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_notification_user` (`notificationId`,`userId`),
  KEY `idx_notification_reads_userId` (`userId`),
  KEY `idx_notification_reads_notificationId` (`notificationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;