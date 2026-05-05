-- Reconstruction des shifts manquants depuis sales (mode fiable: sales.shiftId connu)
-- Compatible MariaDB/MySQL.
-- IMPORTANT:
-- 1) Fais un backup avant exécution.
-- 2) Exécute d'abord la PHASE 1 (preview), puis valide les résultats.
-- 3) Exécute ensuite la PHASE 2 (insert).

-- =========================
-- Paramètres
-- =========================
SET @target_store_id = '4b7fd856-8cbd-471c-aec5-e98792c5c500';
SET @pad_ms = 60000; -- marge de 1 minute avant/après

-- =========================
-- PHASE 1: PREVIEW
-- =========================
-- Candidats = shiftId présents dans sales mais absents de shifts
DROP TEMPORARY TABLE IF EXISTS tmp_missing_shifts;
CREATE TEMPORARY TABLE tmp_missing_shifts AS
SELECT
  s.shiftId                                        AS id,
  MAX(s.userId)                                    AS userId,
  MAX(s.storeId)                                   AS storeId,
  0.00                                             AS openingAmount,
  ROUND(
    SUM(
      CASE
        WHEN COALESCE(s.refunded, 0) IN (1, '1', true) THEN -COALESCE(s.total, 0)
        ELSE COALESCE(s.total, 0)
      END
    ), 2
  )                                                AS expectedAmount,
  ROUND(
    SUM(
      CASE
        WHEN COALESCE(s.refunded, 0) IN (1, '1', true) THEN -COALESCE(s.total, 0)
        ELSE COALESCE(s.total, 0)
      END
    ), 2
  )                                                AS closingAmount,
  0.00                                             AS difference,
  ROUND(
    SUM(
      CASE
        WHEN COALESCE(s.refunded, 0) IN (1, '1', true) THEN -COALESCE(s.cashAmount, 0)
        ELSE COALESCE(s.cashAmount, 0)
      END
    ), 2
  )                                                AS cashAmount,
  ROUND(
    SUM(
      CASE
        WHEN COALESCE(s.refunded, 0) IN (1, '1', true) THEN -COALESCE(s.mobileMoneyAmount, 0)
        ELSE COALESCE(s.mobileMoneyAmount, 0)
      END
    ), 2
  )                                                AS mobileMoneyAmount,
  ROUND(
    SUM(
      CASE
        WHEN COALESCE(s.refunded, 0) IN (1, '1', true) THEN -COALESCE(s.otherAmount, 0)
        ELSE COALESCE(s.otherAmount, 0)
      END
    ), 2
  )                                                AS otherAmount,
  (MIN(s.createdAt) - @pad_ms)                    AS openedAt,
  (MAX(s.createdAt) + @pad_ms)                    AS closedAt,
  'closed'                                         AS status,
  COUNT(*)                                         AS salesCount
FROM sales s
LEFT JOIN shifts sh ON sh.id = s.shiftId
WHERE s.storeId = @target_store_id
  AND s.shiftId IS NOT NULL
  AND s.shiftId <> ''
  AND sh.id IS NULL
GROUP BY s.shiftId;

-- Résumé preview
SELECT
  COUNT(*) AS missing_shift_count,
  COALESCE(SUM(salesCount), 0) AS impacted_sales_count
FROM tmp_missing_shifts;

-- Détail preview (échantillon)
SELECT
  id, userId, storeId, salesCount,
  FROM_UNIXTIME(openedAt / 1000) AS openedAt_dt,
  FROM_UNIXTIME(closedAt / 1000) AS closedAt_dt,
  expectedAmount, closingAmount, difference
FROM tmp_missing_shifts
ORDER BY openedAt DESC
LIMIT 200;

-- =========================
-- PHASE 2: INSERT (décommenter pour appliquer)
-- =========================
-- START TRANSACTION;
--
-- INSERT INTO shifts (
--   id, userId, storeId,
--   openingAmount, closingAmount, expectedAmount, difference,
--   cashAmount, mobileMoneyAmount, otherAmount,
--   openedAt, closedAt, status
-- )
-- SELECT
--   t.id, t.userId, t.storeId,
--   t.openingAmount, t.closingAmount, t.expectedAmount, t.difference,
--   t.cashAmount, t.mobileMoneyAmount, t.otherAmount,
--   t.openedAt, t.closedAt, t.status
-- FROM tmp_missing_shifts t
-- LEFT JOIN shifts sh ON sh.id = t.id
-- WHERE sh.id IS NULL;
--
-- -- Vérification post-insert
-- SELECT ROW_COUNT() AS inserted_shifts;
--
-- COMMIT;

-- =========================
-- Vérification finale (après COMMIT)
-- =========================
-- SELECT COUNT(*) AS shifts_for_store
-- FROM shifts
-- WHERE storeId = @target_store_id;

