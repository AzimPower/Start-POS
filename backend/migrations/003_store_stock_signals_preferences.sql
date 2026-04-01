-- ============================================================
-- PREFERENCE BOUTIQUE: SUIVI DES DEPENSES INDIRECTES (StockSignals)
-- ============================================================
-- Ajoute un drapeau par boutique dans store_balance_settings.
-- 1 = suivre les depenses indirectes
-- 0 = ne pas suivre les depenses indirectes

ALTER TABLE `store_balance_settings`
  ADD COLUMN `trackIndirectExpenses` tinyint(1) DEFAULT 1
  AFTER `beneficeCategories`;

