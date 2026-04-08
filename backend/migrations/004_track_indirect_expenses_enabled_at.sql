-- HORODATAGE D'ACTIVATION DU SUIVI DES DEPENSES INDIRECTES
-- Permet de ne commencer le decompte qu'apres l'activation du suivi

ALTER TABLE `store_balance_settings`
  ADD COLUMN `trackIndirectExpensesEnabledAt` bigint(20) DEFAULT NULL
  AFTER `trackIndirectExpenses`;