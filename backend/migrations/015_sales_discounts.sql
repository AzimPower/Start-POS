ALTER TABLE `sales`
  ADD COLUMN `discountTotal` decimal(20,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `globalDiscountType` varchar(16) DEFAULT NULL,
  ADD COLUMN `globalDiscountValue` decimal(20,2) DEFAULT NULL,
  ADD COLUMN `globalDiscountAmount` decimal(20,2) NOT NULL DEFAULT 0.00;

ALTER TABLE `sale_items`
  ADD COLUMN `subtotal` decimal(20,2) DEFAULT NULL,
  ADD COLUMN `discountAmount` decimal(20,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `lineDiscountType` varchar(16) DEFAULT NULL,
  ADD COLUMN `lineDiscountValue` decimal(20,2) DEFAULT NULL,
  ADD COLUMN `lineDiscountAmount` decimal(20,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `globalDiscountShare` decimal(20,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `originalSubtotal` decimal(20,2) DEFAULT NULL;

UPDATE `sale_items`
SET
  `subtotal` = COALESCE(`subtotal`, `total`, COALESCE(`price`, 0) * COALESCE(`quantity`, 0)),
  `originalSubtotal` = COALESCE(`originalSubtotal`, `total`, COALESCE(`price`, 0) * COALESCE(`quantity`, 0))
WHERE `subtotal` IS NULL OR `originalSubtotal` IS NULL;

ALTER TABLE `store_balance_settings`
  ADD COLUMN `allowSalesDiscounts` tinyint(1) NOT NULL DEFAULT 0;
