ALTER TABLE `email_settings`
    ADD COLUMN IF NOT EXISTS `stock_adjustments` tinyint(1) DEFAULT 1 AFTER `stock_signals`,
    ADD COLUMN IF NOT EXISTS `low_stock_emails` tinyint(1) DEFAULT 1 AFTER `refunds`,
    ADD COLUMN IF NOT EXISTS `out_of_stock_emails` tinyint(1) DEFAULT 1 AFTER `low_stock_emails`;