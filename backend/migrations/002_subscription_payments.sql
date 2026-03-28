-- ============================================================
-- TABLE DES ENCAISSEMENTS D'ABONNEMENTS
-- ============================================================
-- Chaque renouvellement crée un enregistrement dans cette table.
-- Exécutez ce script sur votre base de données.

CREATE TABLE IF NOT EXISTS `subscription_payments` (
  `id`        varchar(36)    NOT NULL,
  `storeId`   varchar(36)    NOT NULL,
  `storeName` varchar(255)   NOT NULL,
  `months`    int(11)        NOT NULL DEFAULT 1,
  `amount`    decimal(10,2)  NOT NULL,
  `paidAt`    bigint(20)     NOT NULL,
  `note`      varchar(255)   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sp_storeId` (`storeId`),
  KEY `idx_sp_paidAt`  (`paidAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
