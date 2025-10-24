-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1:3306
-- Généré le : ven. 24 oct. 2025 à 11:56
-- Version du serveur : 11.8.3-MariaDB-log
-- Version de PHP : 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `u538245909_pos`
--

-- --------------------------------------------------------

--
-- Structure de la table `categories`
--

CREATE TABLE `categories` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `storeId` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `categories`
--

INSERT INTO `categories` (`id`, `name`, `description`, `createdAt`, `storeId`) VALUES
('1969d9ea-90a6-4723-b5dc-2c920a3da047', 'test', 'test', 1761009612369, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2'),
('250a2c11-c38c-4c42-98d9-6720b00c976c', 'v', '', 1760706328547, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a1'),
('79b6c1cd-03c2-43d7-9753-3d454dfb4bb6', 'Plat de Base', '', 1761072215425, '4b7fd856-8cbd-471c-aec5-e98792c5c500'),
('7a3109d8-4ce6-4490-98d2-bcf7febd925a', 'Eau', '', 1761072204624, '4b7fd856-8cbd-471c-aec5-e98792c5c500'),
('9d49004a-c9fe-4794-8ad5-6a0fb6fc523c', 'Matière première', '', 1761305930742, '3d68e406-146c-4da2-97a2-8f605dcc0bd8'),
('a8a7e308-8e87-4db2-8b09-2d719b54055e', 'Diverses', '', 1761060478109, NULL),
('d557b4f2-ec85-4e23-ba8f-fef8d8e68007', 'Jus Naturel', '', 1761072198218, '4b7fd856-8cbd-471c-aec5-e98792c5c500'),
('e670af0c-68df-4dd8-952c-347495c7d1e4', 'Boisson', '', 1761072186485, '4b7fd856-8cbd-471c-aec5-e98792c5c500'),
('e9a894d2-385c-4468-bb13-a67a96de43ec', 'Accompagnant', '', 1761072174489, '4b7fd856-8cbd-471c-aec5-e98792c5c500');

-- --------------------------------------------------------

--
-- Structure de la table `customers`
--

CREATE TABLE `customers` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT 0.00,
  `createdAt` bigint(20) NOT NULL,
  `storeId` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `customers`
--

INSERT INTO `customers` (`id`, `name`, `phone`, `email`, `address`, `notes`, `balance`, `createdAt`, `storeId`) VALUES
('3b59ca00-42c2-4a2e-b980-3028d4a44728', 'dd', '+226 57000000', '', '', '', 0.00, 1761266961776, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2'),
('3ccd71b4-37cd-463d-bbc3-38389d9419a0', 'Abdel Azim Drame', '+226 57007220', 'azimdrame6@gmail.com', 'Sondogo, secteur 32', 'ddd', 0.00, 1760973312763, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2'),
('8ea31317-64a0-48cb-bf7e-a9c97989b55a', 'Azim', '+226 57007220', '', '', '', 0.00, 1761227829142, '4b7fd856-8cbd-471c-aec5-e98792c5c500');

-- --------------------------------------------------------

--
-- Structure de la table `expenses`
--

CREATE TABLE `expenses` (
  `id` varchar(36) NOT NULL,
  `shiftId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expenses_advanced`
--

CREATE TABLE `expenses_advanced` (
  `id` varchar(36) NOT NULL,
  `type` enum('direct','indirect','operational') NOT NULL,
  `name` varchar(100) NOT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `date` bigint(20) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT NULL,
  `directProduct_productId` varchar(36) DEFAULT NULL,
  `directProduct_quantity` int(11) DEFAULT NULL,
  `directProduct_startDate` bigint(20) DEFAULT NULL,
  `directProduct_endDate` bigint(20) DEFAULT NULL,
  `categoryId` varchar(36) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `updatedAt` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `expenses_advanced`
--

INSERT INTO `expenses_advanced` (`id`, `type`, `name`, `amount`, `description`, `date`, `userId`, `storeId`, `status`, `directProduct_productId`, `directProduct_quantity`, `directProduct_startDate`, `directProduct_endDate`, `categoryId`, `createdAt`, `updatedAt`) VALUES
('356b9e6a-993d-4c7e-8356-be464dccca38', 'direct', 'Achat Attiéké', 30000.00, '', 1760978280000, '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'e00867bc-1457-4025-9d55-948963bffa3d', 1, 1760978280000, 1761013965459, NULL, 1760978303801, 1761013965459),
('421dce1e-24eb-4ebe-aa8c-d8401461d87b', 'direct', 'Achat Chichard', 12000.00, '', 1761303360000, '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', 'approved', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 1, 1761303360000, NULL, NULL, 1761303453247, 1761303453247),
('4e759ef4-6987-44c6-a11a-44c792d273a3', 'direct', 'Achat Poisson', 54000.00, '', 1761282960000, '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 'approved', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 248, 1761282960000, NULL, NULL, 1761283004886, 1761283004886),
('5f2b0f85-cbfd-410e-9b3b-13a8325144ec', 'direct', 'Achat Attiéké', 30000.00, '', 1761235920000, '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'e00867bc-1457-4025-9d55-948963bffa3d', 1, 1761235920000, NULL, NULL, 1761236028558, 1761236028558),
('83411d59-cb5a-4792-90ec-7e8e317d9198', 'direct', 'Achat Alloco', 2000.00, '', 1761302760000, '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 'approved', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 1, 1761302760000, NULL, NULL, 1761302870040, 1761302870040),
('90fd9ae2-521f-466a-8a42-1f6f3ed6dece', 'direct', 'Achat Oeuf', 2900.00, '', 1761236100000, '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 'approved', '316d929d-e226-4bc2-b0ab-59f7c5b0812d', 30, 1761236100000, NULL, NULL, 1761236184834, 1761236184834),
('98992635-2452-4cfd-9f94-c0aab02e178f', 'direct', 'Achat Pain ', 750.00, '', 1761306000000, 'ec44ac2c-5f48-4438-b066-61997babdbcd', '3d68e406-146c-4da2-97a2-8f605dcc0bd8', 'approved', '0f74441d-dcd2-4ccc-b01d-016c3c909e60', 1, 1761306000000, NULL, NULL, 1761306094272, 1761306094272),
('a037a84e-aa81-4e97-b1d2-2fcc72a91f5c', 'operational', 'Courant', 4500.00, 'Julienne a payé le courant pour 4500', 1761219000000, '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 'approved', NULL, NULL, NULL, NULL, '09a8bdd7-0b50-44b0-9e0e-ecbe3cc5289f', 1761237611571, 1761237611571),
('b5cb79f0-000b-42c1-87fd-330a7e07b643', 'direct', 'Achat Poisson', 54000.00, '', 1761014100000, '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'f49ef023-f4de-4c5b-960e-4c083656007c', 120, 1761014100000, NULL, NULL, 1761014120819, 1761014120819),
('e9eddfeb-54b0-4814-ad0f-144ebee1a253', 'indirect', 'dd', 1000.00, '', 1761010140000, '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', NULL, NULL, NULL, NULL, 'ae69ecf2-346b-440c-9c0f-25d164cfd7cf', 1761010418419, 1761010418419),
('eab487c2-3ff9-4188-a73a-9dbbf6aa4428', 'direct', 'Achat Attiéké', 30000.00, '', 1761014100000, '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'e00867bc-1457-4025-9d55-948963bffa3d', 1, 1761014100000, 1761036709665, NULL, 1761014130837, 1761036709665),
('ec4b2231-d0df-4cf6-9007-3bd3a5fcae58', 'indirect', 'Huile', 18000.00, '', 1760978640000, '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'indirect', 1, 1760978640000, 1761043330695, '01ea34cd-b867-4b36-ac4d-575660c0e940', 1760978667977, 1761043330695),
('f5a7a6d6-62f3-4546-9256-aa7d55df6f14', 'direct', 'Achat Attiéké', 10000.00, '', 1761036660000, '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 'approved', 'e00867bc-1457-4025-9d55-948963bffa3d', 1, 1761036660000, 1761037233661, NULL, 1761036688959, 1761037233661);

-- --------------------------------------------------------

--
-- Structure de la table `expense_categories`
--

CREATE TABLE `expense_categories` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` enum('indirect','operational') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `productIds` text DEFAULT NULL COMMENT 'JSON array of product IDs for indirect categories'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `expense_categories`
--

INSERT INTO `expense_categories` (`id`, `name`, `type`, `description`, `storeId`, `active`, `createdAt`, `productIds`) VALUES
('01ea34cd-b867-4b36-ac4d-575660c0e940', 'Huile', 'indirect', '', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760967152914, '[\"552e889e-6107-4688-a9c4-0d1d62628287\",\"f49ef023-f4de-4c5b-960e-4c083656007c\"]'),
('087ef4d7-6f69-4b5b-b301-d9e8c58db1ab', 'Papier aluminium ', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237495101, '[\"68beeb70-aefa-430d-910e-9393bf58ff6c\"]'),
('09a8bdd7-0b50-44b0-9e0e-ecbe3cc5289f', 'Courant', 'operational', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237251591, '[]'),
('27a0d128-20f0-4cac-adea-c2c53e56688c', 'Cube Magi', 'indirect', '', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760707436320, '[\"f49ef023-f4de-4c5b-960e-4c083656007c\"]'),
('30606697-1ab0-48cf-9658-1b9adfdf9842', 'Condiments', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237418853, '[\"68beeb70-aefa-430d-910e-9393bf58ff6c\",\"e2a95581-3882-4dfe-b21b-b576b72a6e9b\"]'),
('378e9db6-ab2c-42f2-91b4-612d3e61d843', 'Imprévu', 'operational', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237445590, '[]'),
('3c03cb3f-320d-4ca8-8984-f9854af8e4d7', 'Sachets', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237461705, '[\"27855f2a-b1a1-4c7a-9d61-f49cbc54b11f\",\"68beeb70-aefa-430d-910e-9393bf58ff6c\",\"e2a95581-3882-4dfe-b21b-b576b72a6e9b\",\"b8194fa1-2aee-4e99-86a2-359829dbbfa2\"]'),
('448ffcd4-8a83-4112-a9f3-0aa9dc875f46', 'Papier imprimante', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237514746, '[\"27855f2a-b1a1-4c7a-9d61-f49cbc54b11f\",\"23ce6734-e94a-4d6b-b8fb-ee14c6d61b86\",\"316d929d-e226-4bc2-b0ab-59f7c5b0812d\",\"68beeb70-aefa-430d-910e-9393bf58ff6c\",\"ae8a20dd-7d1a-408f-8b87-567756797670\",\"af4eab03-d385-4eed-8f40-4843c71b7283\",\"b8194fa1-2aee-4e99-86a2-359829dbbfa2\",\"d5d059bf-c508-4e96-9777-d52a4f68653c\",\"e2f9933a-7f84-4f7f-872a-bb48dd5cdee6\",\"e2a95581-3882-4dfe-b21b-b576b72a6e9b\",\"c878f774-e972-4ab8-807b-88eb6e9596ae\",\"740090f5-f8dd-4091-982e-49903a4fa6c9\",\"6a6c916e-2e30-4782-9188-db0b89e8594d\"]'),
('5ad21e2b-5866-4238-a58e-a79e779556f8', 'Savon', 'operational', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237312919, '[]'),
('633df104-1e4e-4d9f-9d3f-76f4d0b6904b', 'Kit', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237474696, '[\"68beeb70-aefa-430d-910e-9393bf58ff6c\",\"27855f2a-b1a1-4c7a-9d61-f49cbc54b11f\",\"b8194fa1-2aee-4e99-86a2-359829dbbfa2\",\"e2a95581-3882-4dfe-b21b-b576b72a6e9b\"]'),
('ab1c603b-e873-4a81-bed5-3cd135c79524', 'Farine', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237323184, '[\"c878f774-e972-4ab8-807b-88eb6e9596ae\"]'),
('ae69ecf2-346b-440c-9c0f-25d164cfd7cf', 'dd', 'indirect', 'd', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1761010404798, '[\"ac4dad72-40ef-40c2-a295-d43237dd65d3\",\"e00867bc-1457-4025-9d55-948963bffa3d\"]'),
('b3398437-4945-4f09-970d-867673ee1e03', 'Sel', 'indirect', '', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760706844953, '[]'),
('d32e9edd-243f-4a81-9ce5-92148caceac1', 'Sel', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237290755, '[\"27855f2a-b1a1-4c7a-9d61-f49cbc54b11f\",\"6a6c916e-2e30-4782-9188-db0b89e8594d\",\"b8194fa1-2aee-4e99-86a2-359829dbbfa2\",\"e2a95581-3882-4dfe-b21b-b576b72a6e9b\"]'),
('d3e0e914-9f0a-4e2a-9910-595a5ed3dde1', 'Huile ', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237374138, '[\"27855f2a-b1a1-4c7a-9d61-f49cbc54b11f\",\"68beeb70-aefa-430d-910e-9393bf58ff6c\",\"b8194fa1-2aee-4e99-86a2-359829dbbfa2\"]'),
('dbf8f3a1-70b1-40ac-9ca5-648e30e26e76', 'Savon Liquide ', 'operational', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237350037, '[]'),
('e5b33114-8046-47a3-ae8c-30251058e6c0', 'Électricité', 'operational', '', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760706877488, NULL),
('fbb98b03-2235-4048-91ea-8ab2bce3ecbd', 'Cube magi', 'indirect', '', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761237334956, '[\"68beeb70-aefa-430d-910e-9393bf58ff6c\"]');

-- --------------------------------------------------------

--
-- Structure de la table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `saleId` varchar(36) DEFAULT NULL,
  `method` enum('cash','mobile_money') DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `products`
--

CREATE TABLE `products` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sku` varchar(50) NOT NULL,
  `categoryId` varchar(36) DEFAULT NULL,
  `salePrice` decimal(10,2) DEFAULT NULL,
  `costPrice` decimal(10,2) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `taxRate` decimal(5,2) DEFAULT NULL,
  `minStock` int(11) DEFAULT NULL,
  `imageUrl` varchar(255) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `updatedAt` bigint(20) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `trackStock` tinyint(1) DEFAULT 0,
  `targetMargin` decimal(10,2) DEFAULT NULL,
  `variablePrices` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `products`
--

INSERT INTO `products` (`id`, `name`, `sku`, `categoryId`, `salePrice`, `costPrice`, `unit`, `taxRate`, `minStock`, `imageUrl`, `createdAt`, `updatedAt`, `storeId`, `trackStock`, `targetMargin`, `variablePrices`) VALUES
('096a399e-2b7b-4083-9120-e29115c4bdf0', 'ccccccccccc', 'PRD-208050', NULL, NULL, NULL, 'pièce', NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68f79b6f85d77.jpeg', 1761056208050, 1761057691953, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0, NULL, NULL),
('0f4f9618-ffa1-47c7-8cc6-2228d3315d21', 'Poulet', 'PRD-412262', NULL, 3000.00, 2400.00, 'pièce', NULL, 5, '', 1761234412262, 1761234412262, '43f48260-9122-489d-ac9d-989a7d055e89', 1, 25.00, NULL),
('0f74441d-dcd2-4ccc-b01d-016c3c909e60', 'Pain ', 'PRD-006373', '9d49004a-c9fe-4794-8ad5-6a0fb6fc523c', 200.00, NULL, 'pièce', NULL, NULL, '', 1761306006373, 1761306006373, '3d68e406-146c-4da2-97a2-8f605dcc0bd8', 0, NULL, NULL),
('23ce6734-e94a-4d6b-b8fb-ee14c6d61b86', 'X Fort', 'PRD-530021', 'e670af0c-68df-4dd8-952c-347495c7d1e4', 200.00, 157.00, 'pièce', NULL, 6, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa5e3bbef72.jpeg', 1761074530021, 1761238588205, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 27.39, NULL),
('27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 'PRD-904730', 'e9a894d2-385c-4468-bb13-a67a96de43ec', 100.00, 65.00, 'pièce', NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa5d84c9eae.jpeg', 1761072904730, 1761238405033, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0, 53.85, NULL),
('316d929d-e226-4bc2-b0ab-59f7c5b0812d', 'Oeuf', 'PRD-284586', 'e9a894d2-385c-4468-bb13-a67a96de43ec', 125.00, 100.00, 'pièce', NULL, 10, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa5dc38fe74.jpeg', 1761074284586, 1761238467893, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 25.00, NULL),
('48ed9e02-14b5-4131-a6b2-7cf58202b9c7', 'Carpe', 'PRD-368531', NULL, NULL, NULL, 'kg', NULL, NULL, '', 1761234368531, 1761234368531, '43f48260-9122-489d-ac9d-989a7d055e89', 0, NULL, NULL),
('68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 'PRD-993101', '79b6c1cd-03c2-43d7-9753-3d454dfb4bb6', 100.00, 50.00, 'pièce', NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa3acaf238c.jpeg', 1761072993101, 1761229514955, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0, 100.00, NULL),
('6a6c916e-2e30-4782-9188-db0b89e8594d', 'Petit Fanta', 'PRD-652320', 'e670af0c-68df-4dd8-952c-347495c7d1e4', 200.00, 134.00, 'pièce', NULL, 6, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa3ba621104.jpeg', 1761074652320, 1761236380895, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 49.25, NULL),
('740090f5-f8dd-4091-982e-49903a4fa6c9', 'Kit', 'PRD-461144', 'a8a7e308-8e87-4db2-8b09-2d719b54055e', 100.00, 33.00, 'pièce', NULL, 20, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa97f39d584.jpeg', 1761073461144, 1761253363880, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 203.03, NULL),
('91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 'PRD-617589', NULL, NULL, NULL, 'pièce', NULL, NULL, '', 1761056617589, 1761056617589, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0, NULL, NULL),
('ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 'PRD-000371', NULL, NULL, NULL, 'pièce', NULL, 3, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68f795428dfbe.jpeg', 1761010000371, 1761056065985, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, NULL, '[{\"label\":\"test\",\"price\":200},{\"label\":\"test1\",\"price\":300}]'),
('ae8a20dd-7d1a-408f-8b87-567756797670', 'Coca cola', 'PRD-298528', 'e670af0c-68df-4dd8-952c-347495c7d1e4', 500.00, 293.00, 'pièce', NULL, 6, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa3bd6c4f0e.jpeg', 1761073298528, 1761229782771, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 70.65, NULL),
('af4eab03-d385-4eed-8f40-4843c71b7283', 'Wifi', 'PRD-058374', 'a8a7e308-8e87-4db2-8b09-2d719b54055e', NULL, NULL, 'pièce', NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa98080eb9a.jpeg', 1761074058376, 1761253384269, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 100.00, '[{\"label\":\"Wifi 1 heure\",\"price\":100},{\"label\":\"Wifi 1 jours\",\"price\":300},{\"label\":\"Wifi 1 semaine\",\"price\":1000},{\"label\":\"Wifi 2 semaines\",\"price\":1500},{\"label\":\"Wifi 1 mois\",\"price\":3000}]'),
('b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 'PRD-331081', NULL, NULL, NULL, 'kg', NULL, NULL, '', 1761234331081, 1761306449882, '43f48260-9122-489d-ac9d-989a7d055e89', 0, 7.69, NULL),
('b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 'PRD-601619', 'e9a894d2-385c-4468-bb13-a67a96de43ec', NULL, NULL, 'pièce', NULL, 60, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa5d5568a66.jpeg', 1761073601621, 1761283004886, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 33.00, '[{\"label\":\"Standard\",\"price\":300},{\"label\":\"Moyen\",\"price\":400},{\"label\":\"Gros\",\"price\":500}]'),
('c878f774-e972-4ab8-807b-88eb6e9596ae', 'X Plus', 'PRD-400878', 'e9a894d2-385c-4468-bb13-a67a96de43ec', 250.00, 172.00, 'pièce', NULL, 6, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa3a831d50e.jpeg', 1761074400878, 1761236432384, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 45.35, NULL),
('d5d059bf-c508-4e96-9777-d52a4f68653c', 'Bissape', 'PRD-202452', 'd557b4f2-ec85-4e23-ba8f-fef8d8e68007', 200.00, 125.00, 'pièce', NULL, 10, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa98172a82a.jpeg', 1761073202452, 1761253399310, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 60.00, NULL),
('e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 'PRD-266106', '4501f2fe-0bfc-4391-a11f-14493f0c8c28', 100.00, 50.00, 'pièce', NULL, NULL, NULL, 1760978266106, 1761054156950, 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0, 100.00, NULL),
('e2a95581-3882-4dfe-b21b-b576b72a6e9b', 'Spaghettis', 'PRD-730916', '79b6c1cd-03c2-43d7-9753-3d454dfb4bb6', 600.00, NULL, 'pièce', NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa983060478.jpeg', 1761073730916, 1761253424520, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0, 30.00, NULL),
('e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 'PRD-121957', '7a3109d8-4ce6-4490-98d2-bcf7febd925a', 50.00, 33.00, 'pièce', NULL, 30, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fa98c6e3c8f.jpeg', 1761073121957, 1761253575054, '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 51.52, NULL);

-- --------------------------------------------------------

--
-- Structure de la table `product_stock`
--

CREATE TABLE `product_stock` (
  `productId` varchar(36) NOT NULL,
  `storeId` varchar(36) NOT NULL,
  `stock` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `product_stock`
--

INSERT INTO `product_stock` (`productId`, `storeId`, `stock`) VALUES
('0f4f9618-ffa1-47c7-8cc6-2228d3315d21', '43f48260-9122-489d-ac9d-989a7d055e89', 0),
('23ce6734-e94a-4d6b-b8fb-ee14c6d61b86', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0),
('316d929d-e226-4bc2-b0ab-59f7c5b0812d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 21),
('6a6c916e-2e30-4782-9188-db0b89e8594d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 8),
('740090f5-f8dd-4091-982e-49903a4fa6c9', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0),
('ac4dad72-40ef-40c2-a295-d43237dd65d3', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 15),
('ae8a20dd-7d1a-408f-8b87-567756797670', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0),
('af4eab03-d385-4eed-8f40-4843c71b7283', '4b7fd856-8cbd-471c-aec5-e98792c5c500', -4),
('b8194fa1-2aee-4e99-86a2-359829dbbfa2', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 267),
('c878f774-e972-4ab8-807b-88eb6e9596ae', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 4),
('d5d059bf-c508-4e96-9777-d52a4f68653c', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 11),
('e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 14),
('f49ef023-f4de-4c5b-960e-4c083656007c', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', -12802061);

-- --------------------------------------------------------

--
-- Structure de la table `sales`
--

CREATE TABLE `sales` (
  `id` varchar(36) NOT NULL,
  `shiftId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `customerId` varchar(36) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `paymentMethod` enum('cash','mobile_money','mixed') DEFAULT NULL,
  `cashAmount` decimal(10,2) DEFAULT NULL,
  `mobileMoneyAmount` decimal(10,2) DEFAULT NULL,
  `otherAmount` decimal(10,2) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL,
  `refunded` tinyint(1) DEFAULT 0,
  `refundedAt` bigint(20) DEFAULT NULL,
  `draft` tinyint(1) DEFAULT 0,
  `completedAt` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `sales`
--

INSERT INTO `sales` (`id`, `shiftId`, `userId`, `storeId`, `customerId`, `subtotal`, `tax`, `total`, `paymentMethod`, `cashAmount`, `mobileMoneyAmount`, `otherAmount`, `createdAt`, `refunded`, `refundedAt`, `draft`, `completedAt`) VALUES
('00385743-441c-47bf-8630-3e27158f3986', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 5700.00, 0.00, 5700.00, 'cash', 5700.00, 0.00, 0.00, 1761265030178, 0, NULL, 0, 1761265030178),
('00948315-0249-4600-b580-0b6cc69e45ce', 'e0b9f1db-b05c-4a17-aa19-36da0e2493a2', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'mobile_money', 0.00, 700.00, 0.00, 1761011588179, 0, NULL, 0, 1761011588179),
('022fb36c-4e8e-458d-997d-cb927f61d1a6', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761166004273, 0, NULL, 0, 1761166004273),
('07740bb0-41e1-4c08-82f7-55d018bc9d60', 'eabf6805-bf3b-476f-9b2f-65badad72c27', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 10000.00, 0.00, 10000.00, 'cash', 10000.00, 0.00, 0.00, 1761012670404, 0, NULL, 0, 1761012670404),
('07e9c08a-32ca-4fae-9d72-21c232803565', '4c14fd5a-50db-4986-87d3-2537614a2f94', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 550.00, 0.00, 550.00, 'cash', 550.00, 0.00, 0.00, 1761303015849, 0, NULL, 0, 1761303015849),
('091fb000-89ba-415d-9cc7-89b7bf5d1c57', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761192556104, 0, NULL, 0, 1761192556104),
('097f6633-ed7e-4a3e-be64-e0530106a96c', 'be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761266218830, 0, NULL, 0, 1761266218830),
('09e7b1e5-faf4-46b3-ab81-4a69e00cc05a', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 304000.00, 0.00, 304000.00, 'cash', 304000.00, 0.00, 0.00, 1761162204966, 0, NULL, 0, 1761162204966),
('0c35c210-d7cc-40b3-bdc9-475d7297dcbd', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761155472381, 0, NULL, 0, 1761155472382),
('0c443fd8-14a9-4f08-8826-224c184acb4c', '1b7f5d8b-bda7-4551-8030-cb6bf215ce3f', 'c462c2ac-0a0f-471d-8400-3fb4b56ea240', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761251816322, 0, NULL, 0, 1761251816322),
('0c4b1554-284d-4a8d-8842-0fd8890abbf2', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761249266157, 0, NULL, 0, 1761249266157),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 5900.00, 0.00, 5900.00, 'cash', 5900.00, 0.00, 0.00, 1761149624850, 0, NULL, 0, 1761149624850),
('0e7b612c-0f07-4f81-a496-09f0afc472fb', 'eabf6805-bf3b-476f-9b2f-65badad72c27', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1000.00, 0.00, 1000.00, 'mobile_money', 0.00, 1000.00, 0.00, 1761011749791, 0, NULL, 0, 1761011749791),
('10601f9d-9a0f-4337-8e08-33cea3160658', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 900.00, 0.00, 900.00, 'cash', 900.00, 0.00, 0.00, 1761165081050, 0, NULL, 0, 1761165081050),
('10e3e4b9-a970-40e3-95f9-54f35ebbe418', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761249391165, 0, NULL, 0, 1761249391165),
('121fb8eb-4e82-4a73-a39b-3e784c773ad1', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 99999999.99, 0.00, 99999999.99, 'cash', 99999999.99, 0.00, 0.00, 1761161549599, 0, NULL, 0, 1761161549599),
('14f27f0f-9f52-4acf-a418-5bfcb69c4ead', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 650.00, 0.00, 650.00, 'mobile_money', 0.00, 650.00, 0.00, 1761234705315, 0, NULL, 0, 1761234705316),
('17241bc2-5d32-4db5-8f31-0f70e7184772', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761257277091, 0, NULL, 0, 1761257277091),
('1869652b-3347-418f-bab7-af4a56c8432f', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 7350.00, 0.00, 7350.00, 'cash', 7350.00, 0.00, 0.00, 1761228827334, 0, NULL, 0, 1761228827334),
('19769d78-a09b-45e2-9e27-c713c71ada30', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761161261644, 0, NULL, 0, 1761161261644),
('199d79d4-b53e-435d-aab6-c59ed87d0a75', '7270a0f6-0efe-4a15-ab6f-b7eb3a04665f', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761222300000, 0, NULL, 0, 1761222300000),
('19e9cb86-8f99-4015-9991-3b0b65929cf1', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 5000.00, 0.00, 5000.00, 'mixed', 4100.00, 900.00, 0.00, 1761148754279, 0, NULL, 0, 1761148754279),
('1b4d7122-dc90-4aa0-8110-cbe76c53e4e2', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 2600.00, 0.00, 2600.00, 'cash', 2600.00, 0.00, 0.00, 1761234819726, 0, NULL, 0, 1761234819726),
('205b971a-b6f2-430a-89d8-6fc24d8b2a45', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', '3ccd71b4-37cd-463d-bbc3-38389d9419a0', 300.00, 0.00, 300.00, 'cash', 300.00, 0.00, 0.00, 1761223952329, 0, NULL, 0, 1761223952329),
('206ebb71-1827-4748-ab6a-5ad50a8c2e25', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761151177822, 0, NULL, 0, 1761151177822),
('2344093c-7b22-426a-b099-4e0c346a6f76', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', '3c4657de-3a0c-42d5-b219-13f290d9efa6', 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761159441984, 0, NULL, 0, 1761159441984),
('262f2c29-f37d-4972-8eb6-ed45be699894', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761153865497, 0, NULL, 0, 1761153865497),
('26a49e9d-1819-4585-9a8d-8cb130655932', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761149870901, 0, NULL, 0, 1761149870901),
('275c9dc4-eccb-49fb-b526-33cdd7f8ed16', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1000.00, 0.00, 1000.00, 'cash', 1000.00, 0.00, 0.00, 1761249326670, 0, NULL, 0, 1761249326670),
('2ae76055-7f6b-47e7-88ae-25ff21d6ea2f', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761160838674, 0, NULL, 0, 1761160838674),
('2be91534-458e-4c5d-8321-913e00caecae', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 571.00, 0.00, 571.00, 'cash', 571.00, 0.00, 0.00, 1761192889225, 0, NULL, 0, 1761192889225),
('2c1123cd-f7cc-4a1d-b985-1f8860b5bd06', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761257252417, 0, NULL, 0, 1761257252417),
('2c1e4701-1179-407b-930f-a221c7bf4f24', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761046478814, 1, 1761046498431, 0, 1761046478814),
('2c38d745-b900-47d9-a453-a74e5f969d51', 'be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761266226960, 0, NULL, 0, 1761266226960),
('324f487e-b932-437e-ae8c-1b2800641db2', 'eabf6805-bf3b-476f-9b2f-65badad72c27', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1000.00, 0.00, 1000.00, 'cash', 1000.00, 0.00, 0.00, 1761011727690, 0, NULL, 0, 1761011727690),
('349479ce-3358-471f-af48-55992444a323', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'mixed', 500.00, 0.00, 0.00, 1761160779302, 0, NULL, 0, 1761160779302),
('39079097-2e8c-4111-9b2a-5d401da879d6', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761152242926, 0, NULL, 0, 1761152242926),
('3a113be0-8c6f-4318-8a2e-f1c22e528d33', '8c61e82a-1cf7-4e01-bd5d-e5bb03520471', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', '3ccd71b4-37cd-463d-bbc3-38389d9419a0', 300.00, 0.00, 300.00, 'mixed', 200.00, 100.00, 0.00, 1761011477082, 0, NULL, 0, 1761011477082),
('3b3ddaca-263e-4211-bf1b-10eea826b025', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761230904804, 0, NULL, 0, 1761230904804),
('3b8153a7-b20b-46ca-bc9d-72899ba28957', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1800.00, 0.00, 1800.00, 'cash', 1800.00, 0.00, 0.00, 1761248337344, 0, NULL, 0, 1761248337344),
('3cd71f60-e379-40df-86e7-f67ec0d7b6ed', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761249645473, 0, NULL, 0, 1761249645473),
('40fa51aa-ce08-4ec6-b64e-141a60f36fde', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761303660471, 0, NULL, 0, 1761303660471),
('41f3f7f3-5acd-4d6d-967d-441185dc2975', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761252760071, 0, NULL, 0, 1761252760071),
('4445dc5f-2578-42ed-a02f-28d578bb2469', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761192774152, 0, NULL, 0, 1761192774152),
('47cef739-7f6b-4d0f-b2aa-c07403fbb196', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761256046598, 0, NULL, 0, 1761256046598),
('4817d7a7-e039-47ed-bf66-179f4fba3eba', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761236216321, 0, NULL, 0, 1761236216321),
('49fa544c-ca4f-41eb-86b3-89a296a32bc8', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761154844652, 0, NULL, 0, 1761154844652),
('4afb28c1-cb40-421b-a488-d7cfc4001dd1', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761147022682, 0, NULL, 0, 1761147022682),
('4b96748a-4fd3-4893-b3fc-98622cf51d0d', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761257136142, 0, NULL, 0, 1761257136142),
('4bb75251-d15d-405b-9afc-4ab27698f2d0', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 5350.00, 0.00, 5350.00, 'cash', 5350.00, 0.00, 0.00, 1761254283171, 0, NULL, 0, 1761254283171),
('50dc3f35-bf9d-4887-a093-70d6512a6332', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1800.00, 0.00, 1800.00, 'mixed', 1200.00, 600.00, 0.00, 1761148674206, 0, NULL, 0, 1761148674206),
('539cf47d-3f89-4e80-a626-51c83c86f769', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1000.00, 0.00, 1000.00, 'cash', 1000.00, 0.00, 0.00, 1761241314541, 0, NULL, 0, 1761241314541),
('541bac9a-9552-4eb0-b81c-f7c664d7ae6c', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 300.00, 0.00, 300.00, 'cash', 300.00, 0.00, 0.00, 1761228324844, 0, NULL, 0, 1761228324844),
('55009eb2-29ad-4117-931c-a47d1cbc4bc3', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 150.00, 0.00, 150.00, 'cash', 150.00, 0.00, 0.00, 1761238913888, 0, NULL, 0, 1761238913888),
('553a1a25-40b8-438a-b840-0bc43f3d59bf', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 68200.00, 0.00, 68200.00, 'cash', 68200.00, 0.00, 0.00, 1761163474419, 0, NULL, 0, 1761163474419),
('57aaae1a-15b7-44e7-b749-dd234c52cc8a', '417539d4-3c07-4c12-bca5-d9fd31c70a8d', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 300.00, 0.00, 300.00, 'mixed', 200.00, 100.00, 0.00, 1761011624852, 0, NULL, 0, 1761011624852),
('5db67a01-3a5f-4645-98c5-19d739e82c04', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'mobile_money', 0.00, 600.00, 0.00, 1761153711465, 0, NULL, 0, 1761153711465),
('5dee7cb9-50ca-4714-b647-8536472c06ae', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761154890290, 0, NULL, 0, 1761154890290),
('5e0647a3-3acd-4f7a-9202-09cc7c40fcf9', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761230812298, 0, NULL, 0, 1761230812298),
('65679c96-17bf-4a96-819d-6e7220bc78c2', '6da8b002-5519-4522-9a3a-7b81267c01c7', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761298083971, 0, NULL, 0, 1761298083971),
('668f9193-f0a7-4a03-90d7-f1c5c0b3ad7b', 'a43c4c5b-045d-4c0f-8f64-7d10e7e2d995', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 700.00, 0.00, 700.00, 'mobile_money', 0.00, 700.00, 0.00, 1761237080451, 0, NULL, 0, 1761237080451),
('67410fc0-dc5e-4d1c-bf79-e1d4a6bada76', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1800.00, 0.00, 1800.00, 'mixed', 1200.00, 600.00, 0.00, 1761148672592, 0, NULL, 0, 1761148672592),
('69e055a5-8d2e-45f2-ae01-84f78b6290da', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761046489907, 0, NULL, 0, 1761046489907),
('6aa0a50c-d033-4b40-86ac-332d80f21776', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 700.00, 0.00, 700.00, 'mobile_money', 0.00, 700.00, 0.00, 1761265136454, 0, NULL, 0, 1761265136454),
('71a2b5bb-0224-4aee-b95a-e3be74a20bab', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761234780517, 0, NULL, 0, 1761234780517),
('7241b434-6694-42a6-b787-c5928d9f49a2', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761155473216, 0, NULL, 0, 1761155473216),
('740410fa-bb52-4850-99ab-5be7013efb15', '0bf10426-7c99-483b-b349-70ce81a14a89', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761066986543, 0, NULL, 0, 1761066986543),
('76793ae4-1d65-4c49-b9d3-91ef2c053369', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761161262787, 0, NULL, 0, 1761161262787),
('79af7010-8bc9-45b4-9581-d2f941df408b', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761149580447, 0, NULL, 0, 1761149580447),
('7c91aed2-1281-4154-ae49-526aa273e6b4', '4c8bbb78-f264-48cf-adf2-0db65696909c', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 6288.00, 0.00, 6288.00, 'cash', 6288.00, 0.00, 0.00, 1761226701063, 0, NULL, 0, 1761226701064),
('806e3e9d-8f24-4924-bf91-324c0605d69d', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 900.00, 0.00, 900.00, 'cash', 900.00, 0.00, 0.00, 1761147467231, 0, NULL, 0, 1761147467231),
('80b70333-ef4f-4c0a-bec7-abd0e814af40', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761230812603, 0, NULL, 0, 1761230812603),
('818cb98e-b0eb-4688-916d-581d9b489512', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 68200.00, 0.00, 68200.00, 'cash', 68200.00, 0.00, 0.00, 1761163472702, 0, NULL, 0, 1761163472702),
('8346ed35-e570-4007-9329-6ce77d5ce8f0', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761252301620, 0, NULL, 0, 1761252301620),
('850bd8f9-c5d7-466e-9ddd-73d69d379cce', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1100.00, 0.00, 1100.00, 'cash', 1100.00, 0.00, 0.00, 1761255285492, 0, NULL, 0, 1761255285492),
('867b9bf8-40fe-485c-85b0-93445fc4bcf7', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761192626984, 0, NULL, 0, 1761192626984),
('8691ff5b-932b-493a-9be5-0f04e355002c', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 4500.00, 0.00, 4500.00, 'cash', 4500.00, 0.00, 0.00, 1761152397539, 0, NULL, 0, 1761152397539),
('877340b2-a97d-4d7b-acea-525a1e72b429', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761192655018, 0, NULL, 0, 1761192655018),
('877fb8b7-bbcf-4ce6-9f75-676fac0054ba', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761146829227, 0, NULL, 0, 1761146829227),
('8809d05a-8a81-48d1-b29b-d0ac08aaaeca', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761252831576, 0, NULL, 0, 1761252831576),
('880fb394-9712-4ccb-8337-ff6f87add688', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 758.00, 0.00, 758.00, 'cash', 758.00, 0.00, 0.00, 1761153047054, 0, NULL, 0, 1761153047054),
('8b473602-3046-4cca-8444-32b618e16ecf', 'be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761266193710, 0, NULL, 0, 1761266193710),
('8ff67d2f-b8d5-441f-a3a8-70866bfaaa4b', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761147023497, 0, NULL, 0, 1761147023497),
('909a92a9-26c1-480e-ab0f-4698ce9dc2d5', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761168979943, 1, 1761188186580, 0, 1761168979943),
('90f53651-0746-4d16-a0a0-f89472a29dbb', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761252717314, 0, NULL, 0, 1761252717315),
('92ad5dd7-768a-48f6-afe7-b55451e5e488', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761178545618, 0, NULL, 0, 1761178545618),
('94b81b55-7603-484e-9b1e-1b5cf17bd3f9', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 400.00, 0.00, 400.00, 'mobile_money', 0.00, 400.00, 0.00, 1761250083432, 0, NULL, 0, 1761250083433),
('963042d9-44c5-46f8-a592-365f80be3c7e', 'be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761266180140, 0, NULL, 0, 1761266180140),
('978b78e6-70aa-4a5b-85e3-80346280bb9d', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1100.00, 0.00, 1100.00, 'cash', 1100.00, 0.00, 0.00, 1761167083678, 0, NULL, 0, 1761167083678),
('995d5e14-540b-4f6e-bfe7-5efc9c17c3f2', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761153867479, 0, NULL, 0, 1761153867479),
('9b0c01fc-0c8e-40e3-8fe6-b832c5f57b13', 'a97cf4fd-e5f3-408b-b283-dd1eeb4285e1', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'mixed', 300.00, 200.00, 0.00, 1761265907124, 0, NULL, 0, 1761265907124),
('9b0e7652-b3fd-48b7-93ad-b5814a678e77', '4c14fd5a-50db-4986-87d3-2537614a2f94', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 250.00, 0.00, 250.00, 'cash', 250.00, 0.00, 0.00, 1761304379212, 0, NULL, 0, 1761304379212),
('9c97bdcd-19e0-4384-82f1-b756f3cbe29a', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761230931316, 0, NULL, 0, 1761230931316),
('9d064d6b-35a2-44a4-a109-85ad1685131f', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761149869465, 0, NULL, 0, 1761149869465),
('9f2d5100-fcfa-4a8a-927d-aeff95a73b9e', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761168978051, 0, NULL, 0, 1761168978051),
('a09ae54e-e8cf-4cf8-82ed-1c7d2b43340b', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 300.00, 0.00, 300.00, 'cash', 300.00, 0.00, 0.00, 1761253198141, 0, NULL, 0, 1761253198141),
('a225eaf4-f4d4-4aec-9bda-d7a88b07cf2e', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 10400.00, 0.00, 10400.00, 'cash', 10400.00, 0.00, 0.00, 1761148024123, 0, NULL, 0, 1761148024123),
('a30c8014-31a1-4991-b6e5-778f7be8a64d', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761249700799, 0, NULL, 0, 1761249700799),
('a3d8c282-27ae-4793-bfeb-d0f5de31c779', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761150579612, 0, NULL, 0, 1761150579612),
('a41c9fa1-2531-4e9c-9d8a-515f3d313683', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1000.00, 0.00, 1000.00, 'cash', 1000.00, 0.00, 0.00, 1761228504123, 0, NULL, 0, 1761228504123),
('a5a18483-dcd7-496d-823e-b08c35ee9875', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761192800473, 0, NULL, 0, 1761192800473),
('a5dfd5df-b75f-4c54-93fd-515c8d38ac69', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 800.00, 0.00, 800.00, 'cash', 800.00, 0.00, 0.00, 1761254157133, 0, NULL, 0, 1761254157133),
('a634909c-e00f-4d38-87f4-2b61360ab6ef', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761045768910, 0, NULL, 0, 1761045768910),
('a6904b6b-957e-4638-ae5f-f013b7622d04', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 900.00, 0.00, 900.00, 'cash', 900.00, 0.00, 0.00, 1761149498766, 0, NULL, 0, 1761149498766),
('a750af88-ca25-49f2-bd7a-e3dea024bb3e', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761241750295, 0, NULL, 0, 1761241750295),
('a804ea42-6d5b-4f4c-91ae-b0eccf3bf23a', 'a43c4c5b-045d-4c0f-8f64-7d10e7e2d995', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761137213686, 0, NULL, 0, 1761137213686),
('a841bca8-2e38-49e9-9e39-4d560b6e8efd', '1a5dd1e3-7dd7-4ec2-80c4-353f7aa86f4b', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 10000.00, 0.00, 10000.00, 'cash', 10000.00, 0.00, 0.00, 1761003764880, 0, NULL, 0, 1761003764880),
('a90fd8c3-6f60-49bd-a4c3-6a1313544b46', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1100.00, 0.00, 1100.00, 'cash', 1100.00, 0.00, 0.00, 1761147551139, 0, NULL, 0, 1761147551139),
('ad5fd2db-c5da-4f7c-aacd-22832c74cd25', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'mixed', 300.00, 200.00, 0.00, 1761045821691, 0, NULL, 0, 1761045821691),
('b10b1e26-2319-4b82-b423-09027ddc9062', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761253121108, 0, NULL, 0, 1761253121108),
('b661df77-e47b-479e-8b00-bee127d6957d', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761253914459, 0, NULL, 0, 1761253914459),
('b8fedcdc-72b3-4a1f-840e-26d70df2e2c2', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 950.00, 0.00, 950.00, 'cash', 950.00, 0.00, 0.00, 1761235976541, 0, NULL, 0, 1761235976541),
('bb0c2e4f-c2eb-49d9-ac89-eaba8fad0a7d', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 250.00, 0.00, 250.00, 'cash', 250.00, 0.00, 0.00, 1761254777556, 0, NULL, 0, 1761254777556),
('bb5cc0ef-9503-420f-818f-c4299dcbd6c8', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761192241528, 0, NULL, 0, 1761192241528),
('bc586365-3227-47e8-9af8-214b08aa8b52', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761166037141, 0, NULL, 0, 1761166037141),
('bf79eb2b-778f-40bb-a0f1-3228beb130a5', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1300.00, 0.00, 1300.00, 'cash', 1300.00, 0.00, 0.00, 1761166005361, 0, NULL, 0, 1761166005361),
('bf98f3c7-69e7-4b0c-93f6-9635c04f853a', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761252776482, 0, NULL, 0, 1761252776482),
('bfaca906-dc6d-496e-a7ae-886ae6f6e53a', '4c8bbb78-f264-48cf-adf2-0db65696909c', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1200.00, 0.00, 1200.00, 'cash', 1200.00, 0.00, 0.00, 1761281567302, 0, NULL, 0, 1761281567302),
('c1543761-2ae7-4115-8f0f-058d1b3f892a', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 600.00, 0.00, 600.00, 'cash', 600.00, 0.00, 0.00, 1761155508604, 0, NULL, 0, 1761155508604),
('c36c3243-a2fb-4329-a51a-29f757d8fe50', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1100.00, 0.00, 1100.00, 'cash', 1100.00, 0.00, 0.00, 1761252879919, 0, NULL, 0, 1761252879919),
('c53cfd37-b696-4028-be4d-e894727083fa', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 5750.00, 0.00, 5750.00, 'cash', 5750.00, 0.00, 0.00, 1761234123182, 0, NULL, 0, 1761234123182),
('c97a9274-89fb-4c6d-bae2-a93eac01a202', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761153901708, 0, NULL, 0, 1761153901708),
('c988421e-32ac-4839-b491-dfafe11bc503', 'a43c4c5b-045d-4c0f-8f64-7d10e7e2d995', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 100.00, 0.00, 100.00, 'cash', 100.00, 0.00, 0.00, 1761138066375, 0, NULL, 0, 1761138066375),
('d151981f-97ce-4584-8c92-9da3bab3234a', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 150000.00, 0.00, 150000.00, 'cash', 150000.00, 0.00, 0.00, 1761161469930, 0, NULL, 0, 1761161469930),
('d3ed1000-0f26-45da-8d84-3675880509cf', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761252994547, 0, NULL, 0, 1761252994547),
('d577872a-3074-42e6-8f07-746f0e789ccb', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 800.00, 0.00, 800.00, 'cash', 800.00, 0.00, 0.00, 1761249987249, 0, NULL, 0, 1761249987249),
('d5e48dd4-7fe3-4d7f-90f0-dd9b933fa087', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761149547045, 0, NULL, 0, 1761149547045),
('d635dcd1-0821-44d3-a15a-637fcd057a2e', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 900000.00, 0.00, 900000.00, 'cash', 900000.00, 0.00, 0.00, 1761167110291, 0, NULL, 0, 1761167110292),
('dc148a30-e51a-4219-b399-feefe30532a6', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761150580454, 0, NULL, 0, 1761150580454),
('dd74bc7b-e4f7-4c29-931a-1adbdd3ca2e9', 'eabf6805-bf3b-476f-9b2f-65badad72c27', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 1000.00, 0.00, 1000.00, 'mixed', 950.00, 50.00, 0.00, 1761011774593, 0, NULL, 0, 1761011774593),
('dee9dfcf-265d-4b6a-af61-87bc3f12aa02', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 800.00, 0.00, 800.00, 'cash', 800.00, 0.00, 0.00, 1761164285748, 0, NULL, 0, 1761164285748),
('df37cc8d-efe6-4c82-8dfd-0c7da60d69e6', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 800.00, 0.00, 800.00, 'cash', 800.00, 0.00, 0.00, 1761164288082, 0, NULL, 0, 1761164288082),
('df92b96e-550f-40e6-8418-bc702618201f', '467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1200.00, 0.00, 1200.00, 'mobile_money', 0.00, 1200.00, 0.00, 1761235185050, 0, NULL, 0, 1761235185050),
('e008e8d8-21cc-4239-ab05-e4b1edf9cf93', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761155534588, 0, NULL, 0, 1761155534588),
('e155707f-43f5-4e6c-9791-5ddac3404a7d', '8c61e82a-1cf7-4e01-bd5d-e5bb03520471', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761011321369, 0, NULL, 0, 1761011321369),
('e1a614ea-1837-4263-8c16-7c405db46462', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761253966321, 0, NULL, 0, 1761253966321),
('e3e0bd1f-26ca-4cf3-8293-8a3c885956d8', 'be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761266404173, 0, NULL, 0, 1761266404173),
('e527ac81-7a25-4018-8bfd-cc3715001af8', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761149854334, 0, NULL, 0, 1761149854334),
('e760e65e-acb9-4b59-b655-dccd75dbd3e0', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761263162799, 0, NULL, 0, 1761263162800),
('e79fce98-821a-4c94-a272-61678faff6a2', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 1500.00, 0.00, 1500.00, 'cash', 1500.00, 0.00, 0.00, 1761256797964, 0, NULL, 0, 1761256797964),
('eacc21b5-4e71-4230-9aa0-87e609b7b6de', 'cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 800.00, 0.00, 800.00, 'cash', 800.00, 0.00, 0.00, 1761230952847, 0, NULL, 0, 1761230952847),
('ed525877-fb6c-4f1f-98b4-5a9b5d6306ec', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'mobile_money', 0.00, 500.00, 0.00, 1761265082159, 0, NULL, 0, 1761265082159),
('efffc936-015b-4c8f-8d46-4ba638802d1d', 'f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761250040062, 0, NULL, 0, 1761250040062),
('f0fbb4af-42a9-4fe0-8c35-00cf94bd3f4f', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761151178620, 0, NULL, 0, 1761151178620),
('f1342a80-5932-4791-9812-145b92a29d52', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761166035423, 0, NULL, 0, 1761166035423),
('f1f0eb66-7d4a-4a79-b31f-26ede3909ee5', '87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', NULL, 650.00, 0.00, 650.00, 'cash', 650.00, 0.00, 0.00, 1761236318944, 0, NULL, 0, 1761236318944),
('f2044cf4-82c1-4b5e-a6d6-61b20764cef0', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 4000.00, 0.00, 4000.00, 'mobile_money', 0.00, 4000.00, 0.00, 1761152293633, 0, NULL, 0, 1761152293633),
('fa6380ee-24ab-48c4-9c92-1e66144a6448', '84e82505-d2fa-4558-9537-fd70190a1129', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 700.00, 0.00, 700.00, 'cash', 700.00, 0.00, 0.00, 1761197245230, 0, NULL, 0, 1761197245230),
('fb60a909-43de-4e8b-83b5-a8ad428fee44', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 200.00, 0.00, 200.00, 'cash', 200.00, 0.00, 0.00, 1761152242010, 0, NULL, 0, 1761152242010),
('fb659f44-c7a9-4c29-9b17-5ca1c44f8791', '0bf10426-7c99-483b-b349-70ce81a14a89', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 500.00, 0.00, 500.00, 'cash', 500.00, 0.00, 0.00, 1761066989526, 0, NULL, 0, 1761066989526),
('fd58b784-2940-4df1-ae61-7a4593292889', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 3000900.00, 0.00, 3000900.00, 'cash', 3000900.00, 0.00, 0.00, 1761162855858, 0, NULL, 0, 1761162855858),
('fdf0520f-64cf-4028-a4d0-314df896ec50', '309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', NULL, 400.00, 0.00, 400.00, 'cash', 400.00, 0.00, 0.00, 1761136186272, 0, NULL, 0, 1761136186272);

-- --------------------------------------------------------

--
-- Structure de la table `sale_items`
--

CREATE TABLE `sale_items` (
  `saleId` varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `sale_items`
--

INSERT INTO `sale_items` (`saleId`, `productId`, `name`, `quantity`, `price`, `tax`, `total`) VALUES
('00385743-441c-47bf-8630-3e27158f3986', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 18, 100.00, 0.00, 1800.00),
('00385743-441c-47bf-8630-3e27158f3986', 'af4eab03-d385-4eed-8f40-4843c71b7283', 'Wifi', 1, 300.00, 0.00, 300.00),
('00385743-441c-47bf-8630-3e27158f3986', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 10, 300.00, 0.00, 3000.00),
('00385743-441c-47bf-8630-3e27158f3986', 'c878f774-e972-4ab8-807b-88eb6e9596ae', 'X Plus', 2, 250.00, 0.00, 500.00),
('00385743-441c-47bf-8630-3e27158f3986', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 2, 50.00, 0.00, 100.00),
('00948315-0249-4600-b580-0b6cc69e45ce', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('00948315-0249-4600-b580-0b6cc69e45ce', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('00948315-0249-4600-b580-0b6cc69e45ce', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('022fb36c-4e8e-458d-997d-cb927f61d1a6', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 2, 300.00, 0.00, 600.00),
('07740bb0-41e1-4c08-82f7-55d018bc9d60', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 100, 100.00, 0.00, 10000.00),
('07e9c08a-32ca-4fae-9d72-21c232803565', 'c878f774-e972-4ab8-807b-88eb6e9596ae', 'X Plus', 2, 250.00, 0.00, 500.00),
('07e9c08a-32ca-4fae-9d72-21c232803565', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 1, 50.00, 0.00, 50.00),
('091fb000-89ba-415d-9cc7-89b7bf5d1c57', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('097f6633-ed7e-4a3e-be64-e0530106a96c', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('09e7b1e5-faf4-46b3-ab81-4a69e00cc05a', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 40, 100.00, 0.00, 4000.00),
('09e7b1e5-faf4-46b3-ab81-4a69e00cc05a', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1000, 300.00, 0.00, 300000.00),
('0acec706-8068-4e70-89d9-e621d46683de', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('0c35c210-d7cc-40b3-bdc9-475d7297dcbd', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('0c35c210-d7cc-40b3-bdc9-475d7297dcbd', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('0c443fd8-14a9-4f08-8826-224c184acb4c', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 1, 1300.00, 0.00, 1300.00),
('0c4b1554-284d-4a8d-8842-0fd8890abbf2', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', '096a399e-2b7b-4083-9120-e29115c4bdf0', 'ccccccccccc', 1, 4554.00, 0.00, 4554.00),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 646.00, 0.00, 646.00),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('0ded7fe9-6c72-45fd-84b3-7970bde71761', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('0e7b612c-0f07-4f81-a496-09f0afc472fb', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 10, 100.00, 0.00, 1000.00),
('10601f9d-9a0f-4337-8e08-33cea3160658', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('10601f9d-9a0f-4337-8e08-33cea3160658', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('10e3e4b9-a970-40e3-95f9-54f35ebbe418', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('10e3e4b9-a970-40e3-95f9-54f35ebbe418', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('121fb8eb-4e82-4a73-a39b-3e784c773ad1', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 100, 100.00, 0.00, 10000.00),
('121fb8eb-4e82-4a73-a39b-3e784c773ad1', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 12800000, 300.00, 0.00, 99999999.99),
('14f27f0f-9f52-4acf-a418-5bfcb69c4ead', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 1, 650.00, 0.00, 650.00),
('17241bc2-5d32-4db5-8f31-0f70e7184772', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 2, 50.00, 0.00, 100.00),
('1869652b-3347-418f-bab7-af4a56c8432f', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 31, 100.00, 0.00, 3100.00),
('1869652b-3347-418f-bab7-af4a56c8432f', '6a6c916e-2e30-4782-9188-db0b89e8594d', 'Petit Fanta', 2, 200.00, 0.00, 400.00),
('1869652b-3347-418f-bab7-af4a56c8432f', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 7, 300.00, 0.00, 2100.00),
('19769d78-a09b-45e2-9e27-c713c71ada30', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('19769d78-a09b-45e2-9e27-c713c71ada30', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('199d79d4-b53e-435d-aab6-c59ed87d0a75', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('19e9cb86-8f99-4015-9991-3b0b65929cf1', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 5, 100.00, 0.00, 500.00),
('19e9cb86-8f99-4015-9991-3b0b65929cf1', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 2, 500.00, 0.00, 1000.00),
('1b4d7122-dc90-4aa0-8110-cbe76c53e4e2', '48ed9e02-14b5-4131-a6b2-7cf58202b9c7', 'Carpe', 1, 2600.00, 0.00, 2600.00),
('1b72fae6-056a-435b-903b-246d614919c5', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 31, 100.00, 0.00, 3100.00),
('1b72fae6-056a-435b-903b-246d614919c5', '6a6c916e-2e30-4782-9188-db0b89e8594d', 'Petit Fanta', 2, 200.00, 0.00, 400.00),
('1b72fae6-056a-435b-903b-246d614919c5', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 7, 300.00, 0.00, 2100.00),
('205b971a-b6f2-430a-89d8-6fc24d8b2a45', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('206ebb71-1827-4748-ab6a-5ad50a8c2e25', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('2344093c-7b22-426a-b099-4e0c346a6f76', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('2344093c-7b22-426a-b099-4e0c346a6f76', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('262f2c29-f37d-4972-8eb6-ed45be699894', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('262f2c29-f37d-4972-8eb6-ed45be699894', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('26a49e9d-1819-4585-9a8d-8cb130655932', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('26a49e9d-1819-4585-9a8d-8cb130655932', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('275c9dc4-eccb-49fb-b526-33cdd7f8ed16', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('275c9dc4-eccb-49fb-b526-33cdd7f8ed16', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('2ae76055-7f6b-47e7-88ae-25ff21d6ea2f', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('2ae76055-7f6b-47e7-88ae-25ff21d6ea2f', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('2be91534-458e-4c5d-8321-913e00caecae', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 471.00, 0.00, 471.00),
('2be91534-458e-4c5d-8321-913e00caecae', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('2c1123cd-f7cc-4a1d-b985-1f8860b5bd06', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('2c1123cd-f7cc-4a1d-b985-1f8860b5bd06', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('2c1e4701-1179-407b-930f-a221c7bf4f24', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('2c38d745-b900-47d9-a453-a74e5f969d51', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('324f487e-b932-437e-ae8c-1b2800641db2', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 10, 100.00, 0.00, 1000.00),
('349479ce-3358-471f-af48-55992444a323', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('349479ce-3358-471f-af48-55992444a323', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('39079097-2e8c-4111-9b2a-5d401da879d6', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('3a113be0-8c6f-4318-8a2e-f1c22e528d33', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('3b3ddaca-263e-4211-bf1b-10eea826b025', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('3b8153a7-b20b-46ca-bc9d-72899ba28957', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 3, 100.00, 0.00, 300.00),
('3b8153a7-b20b-46ca-bc9d-72899ba28957', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 8, 100.00, 0.00, 800.00),
('3b8153a7-b20b-46ca-bc9d-72899ba28957', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('3b8153a7-b20b-46ca-bc9d-72899ba28957', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 2, 50.00, 0.00, 100.00),
('3cd71f60-e379-40df-86e7-f67ec0d7b6ed', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 3, 100.00, 0.00, 300.00),
('3cd71f60-e379-40df-86e7-f67ec0d7b6ed', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 400.00, 0.00, 400.00),
('40fa51aa-ce08-4ec6-b64e-141a60f36fde', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 1, 1300.00, 0.00, 1300.00),
('41f3f7f3-5acd-4d6d-967d-441185dc2975', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('41f3f7f3-5acd-4d6d-967d-441185dc2975', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('4445dc5f-2578-42ed-a02f-28d578bb2469', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('47cef739-7f6b-4d0f-b2aa-c07403fbb196', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('47cef739-7f6b-4d0f-b2aa-c07403fbb196', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('4817d7a7-e039-47ed-bf66-179f4fba3eba', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 1, 1300.00, 0.00, 1300.00),
('49fa544c-ca4f-41eb-86b3-89a296a32bc8', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('49fa544c-ca4f-41eb-86b3-89a296a32bc8', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('4afb28c1-cb40-421b-a488-d7cfc4001dd1', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('4b96748a-4fd3-4893-b3fc-98622cf51d0d', 'd5d059bf-c508-4e96-9777-d52a4f68653c', 'Bissape', 1, 200.00, 0.00, 200.00),
('4bb75251-d15d-405b-9afc-4ab27698f2d0', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 23, 100.00, 0.00, 2300.00),
('4bb75251-d15d-405b-9afc-4ab27698f2d0', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 10, 300.00, 0.00, 3000.00),
('4bb75251-d15d-405b-9afc-4ab27698f2d0', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 1, 50.00, 0.00, 50.00),
('50dc3f35-bf9d-4887-a093-70d6512a6332', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 3, 100.00, 0.00, 300.00),
('50dc3f35-bf9d-4887-a093-70d6512a6332', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('539cf47d-3f89-4e80-a626-51c83c86f769', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('539cf47d-3f89-4e80-a626-51c83c86f769', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('541bac9a-9552-4eb0-b81c-f7c664d7ae6c', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 6, 50.00, 0.00, 300.00),
('55009eb2-29ad-4117-931c-a47d1cbc4bc3', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 3, 50.00, 0.00, 150.00),
('553a1a25-40b8-438a-b840-0bc43f3d59bf', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 499, 100.00, 0.00, 49900.00),
('553a1a25-40b8-438a-b840-0bc43f3d59bf', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 61, 300.00, 0.00, 18300.00),
('55634e24-7310-4ba7-84a3-3f25b5cb6a2a', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 4, 300.00, 0.00, 1200.00),
('57aaae1a-15b7-44e7-b749-dd234c52cc8a', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('5db67a01-3a5f-4645-98c5-19d739e82c04', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('5db67a01-3a5f-4645-98c5-19d739e82c04', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('5dee7cb9-50ca-4714-b647-8536472c06ae', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('5dee7cb9-50ca-4714-b647-8536472c06ae', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('5e0647a3-3acd-4f7a-9202-09cc7c40fcf9', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('65679c96-17bf-4a96-819d-6e7220bc78c2', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 200.00, 0.00, 200.00),
('65679c96-17bf-4a96-819d-6e7220bc78c2', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('668f9193-f0a7-4a03-90d7-f1c5c0b3ad7b', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('668f9193-f0a7-4a03-90d7-f1c5c0b3ad7b', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('668f9193-f0a7-4a03-90d7-f1c5c0b3ad7b', 'd5d059bf-c508-4e96-9777-d52a4f68653c', 'Bissape', 1, 200.00, 0.00, 200.00),
('67410fc0-dc5e-4d1c-bf79-e1d4a6bada76', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 3, 100.00, 0.00, 300.00),
('67410fc0-dc5e-4d1c-bf79-e1d4a6bada76', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('69e055a5-8d2e-45f2-ae01-84f78b6290da', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 6, 100.00, 0.00, 600.00),
('6a98cb30-590c-4b11-a644-fd179494ac66', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 100, 100.00, 0.00, 10000.00),
('6aa0a50c-d033-4b40-86ac-332d80f21776', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 3, 100.00, 0.00, 300.00),
('6aa0a50c-d033-4b40-86ac-332d80f21776', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('6aa0a50c-d033-4b40-86ac-332d80f21776', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 2, 50.00, 0.00, 100.00),
('71a2b5bb-0224-4aee-b95a-e3be74a20bab', '48ed9e02-14b5-4131-a6b2-7cf58202b9c7', 'Carpe', 1, 1300.00, 0.00, 1300.00),
('7241b434-6694-42a6-b787-c5928d9f49a2', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('7241b434-6694-42a6-b787-c5928d9f49a2', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('740410fa-bb52-4850-99ab-5be7013efb15', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('76793ae4-1d65-4c49-b9d3-91ef2c053369', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('76793ae4-1d65-4c49-b9d3-91ef2c053369', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('79af7010-8bc9-45b4-9581-d2f941df408b', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('79af7010-8bc9-45b4-9581-d2f941df408b', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('7c91aed2-1281-4154-ae49-526aa273e6b4', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 5588.00, 0.00, 5588.00),
('7c91aed2-1281-4154-ae49-526aa273e6b4', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('7c91aed2-1281-4154-ae49-526aa273e6b4', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('7c91aed2-1281-4154-ae49-526aa273e6b4', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('806e3e9d-8f24-4924-bf91-324c0605d69d', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('806e3e9d-8f24-4924-bf91-324c0605d69d', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('80b70333-ef4f-4c0a-bec7-abd0e814af40', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('818cb98e-b0eb-4688-916d-581d9b489512', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 499, 100.00, 0.00, 49900.00),
('818cb98e-b0eb-4688-916d-581d9b489512', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 61, 300.00, 0.00, 18300.00),
('8346ed35-e570-4007-9329-6ce77d5ce8f0', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('8346ed35-e570-4007-9329-6ce77d5ce8f0', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('850bd8f9-c5d7-466e-9ddd-73d69d379cce', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 3, 100.00, 0.00, 300.00),
('850bd8f9-c5d7-466e-9ddd-73d69d379cce', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('850bd8f9-c5d7-466e-9ddd-73d69d379cce', 'd5d059bf-c508-4e96-9777-d52a4f68653c', 'Bissape', 1, 200.00, 0.00, 200.00),
('867b9bf8-40fe-485c-85b0-93445fc4bcf7', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('8691ff5b-932b-493a-9be5-0f04e355002c', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 3, 200.00, 0.00, 600.00),
('8691ff5b-932b-493a-9be5-0f04e355002c', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('8691ff5b-932b-493a-9be5-0f04e355002c', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 5, 500.00, 0.00, 2500.00),
('877340b2-a97d-4d7b-acea-525a1e72b429', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('877fb8b7-bbcf-4ce6-9f75-676fac0054ba', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('877fb8b7-bbcf-4ce6-9f75-676fac0054ba', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('8809d05a-8a81-48d1-b29b-d0ac08aaaeca', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('8809d05a-8a81-48d1-b29b-d0ac08aaaeca', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('880fb394-9712-4ccb-8337-ff6f87add688', '096a399e-2b7b-4083-9120-e29115c4bdf0', 'ccccccccccc', 1, 58.00, 0.00, 58.00),
('880fb394-9712-4ccb-8337-ff6f87add688', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('880fb394-9712-4ccb-8337-ff6f87add688', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 2, 300.00, 0.00, 600.00),
('8b473602-3046-4cca-8444-32b618e16ecf', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('8ff67d2f-b8d5-441f-a3a8-70866bfaaa4b', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('909a92a9-26c1-480e-ab0f-4698ce9dc2d5', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('909a92a9-26c1-480e-ab0f-4698ce9dc2d5', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('90f53651-0746-4d16-a0a0-f89472a29dbb', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 1, 100.00, 0.00, 100.00),
('92ad5dd7-768a-48f6-afe7-b55451e5e488', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('92ad5dd7-768a-48f6-afe7-b55451e5e488', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('94b81b55-7603-484e-9b1e-1b5cf17bd3f9', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 400.00, 0.00, 400.00),
('963042d9-44c5-46f8-a592-365f80be3c7e', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('978b78e6-70aa-4a5b-85e3-80346280bb9d', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 8, 100.00, 0.00, 800.00),
('978b78e6-70aa-4a5b-85e3-80346280bb9d', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('995d5e14-540b-4f6e-bfe7-5efc9c17c3f2', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('995d5e14-540b-4f6e-bfe7-5efc9c17c3f2', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('9b0c01fc-0c8e-40e3-8fe6-b832c5f57b13', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 5, 100.00, 0.00, 500.00),
('9b0e7652-b3fd-48b7-93ad-b5814a678e77', 'c878f774-e972-4ab8-807b-88eb6e9596ae', 'X Plus', 1, 250.00, 0.00, 250.00),
('9c97bdcd-19e0-4384-82f1-b756f3cbe29a', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('9d064d6b-35a2-44a4-a109-85ad1685131f', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('9d064d6b-35a2-44a4-a109-85ad1685131f', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('9f2d5100-fcfa-4a8a-927d-aeff95a73b9e', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('9f2d5100-fcfa-4a8a-927d-aeff95a73b9e', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('a09ae54e-e8cf-4cf8-82ed-1c7d2b43340b', 'af4eab03-d385-4eed-8f40-4843c71b7283', 'Wifi', 3, 100.00, 0.00, 300.00),
('a225eaf4-f4d4-4aec-9bda-d7a88b07cf2e', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 9000.00, 0.00, 9000.00),
('a225eaf4-f4d4-4aec-9bda-d7a88b07cf2e', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 300.00, 0.00, 300.00),
('a225eaf4-f4d4-4aec-9bda-d7a88b07cf2e', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 7, 100.00, 0.00, 700.00),
('a225eaf4-f4d4-4aec-9bda-d7a88b07cf2e', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('a30c8014-31a1-4991-b6e5-778f7be8a64d', 'd5d059bf-c508-4e96-9777-d52a4f68653c', 'Bissape', 1, 200.00, 0.00, 200.00),
('a3d8c282-27ae-4793-bfeb-d0f5de31c779', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('a3d8c282-27ae-4793-bfeb-d0f5de31c779', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('a41c9fa1-2531-4e9c-9d8a-515f3d313683', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('a41c9fa1-2531-4e9c-9d8a-515f3d313683', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('a5a18483-dcd7-496d-823e-b08c35ee9875', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('a5a18483-dcd7-496d-823e-b08c35ee9875', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('a5dfd5df-b75f-4c54-93fd-515c8d38ac69', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 5, 100.00, 0.00, 500.00),
('a5dfd5df-b75f-4c54-93fd-515c8d38ac69', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('a634909c-e00f-4d38-87f4-2b61360ab6ef', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 5, 100.00, 0.00, 500.00),
('a6904b6b-957e-4638-ae5f-f013b7622d04', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('a6904b6b-957e-4638-ae5f-f013b7622d04', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('a750af88-ca25-49f2-bd7a-e3dea024bb3e', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('a750af88-ca25-49f2-bd7a-e3dea024bb3e', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('a804ea42-6d5b-4f4c-91ae-b0eccf3bf23a', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 1, 100.00, 0.00, 100.00),
('a841bca8-2e38-49e9-9e39-4d560b6e8efd', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 100, 100.00, 0.00, 10000.00),
('a90fd8c3-6f60-49bd-a4c3-6a1313544b46', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('a90fd8c3-6f60-49bd-a4c3-6a1313544b46', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('ad5fd2db-c5da-4f7c-aacd-22832c74cd25', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('ad5fd2db-c5da-4f7c-aacd-22832c74cd25', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('b10b1e26-2319-4b82-b423-09027ddc9062', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 3, 100.00, 0.00, 300.00),
('b10b1e26-2319-4b82-b423-09027ddc9062', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('b661df77-e47b-479e-8b00-bee127d6957d', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('b661df77-e47b-479e-8b00-bee127d6957d', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('b8fedcdc-72b3-4a1f-840e-26d70df2e2c2', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 2, 100.00, 0.00, 200.00),
('b8fedcdc-72b3-4a1f-840e-26d70df2e2c2', '316d929d-e226-4bc2-b0ab-59f7c5b0812d', 'Oeuf', 2, 125.00, 0.00, 250.00),
('b8fedcdc-72b3-4a1f-840e-26d70df2e2c2', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('b8fedcdc-72b3-4a1f-840e-26d70df2e2c2', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('bb0c2e4f-c2eb-49d9-ac89-eaba8fad0a7d', 'c878f774-e972-4ab8-807b-88eb6e9596ae', 'X Plus', 1, 250.00, 0.00, 250.00),
('bb5cc0ef-9503-420f-818f-c4299dcbd6c8', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('bb5cc0ef-9503-420f-818f-c4299dcbd6c8', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('bc586365-3227-47e8-9af8-214b08aa8b52', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('bf79eb2b-778f-40bb-a0f1-3228beb130a5', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 2, 300.00, 0.00, 600.00),
('bf98f3c7-69e7-4b0c-93f6-9635c04f853a', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('bfaca906-dc6d-496e-a7ae-886ae6f6e53a', '91b83d5e-4625-4e25-92d7-cc831e45e74c', 'fffffffffffffff', 1, 1200.00, 0.00, 1200.00),
('c1543761-2ae7-4115-8f0f-058d1b3f892a', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 3, 100.00, 0.00, 300.00),
('c1543761-2ae7-4115-8f0f-058d1b3f892a', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('c36c3243-a2fb-4329-a51a-29f757d8fe50', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('c36c3243-a2fb-4329-a51a-29f757d8fe50', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('c36c3243-a2fb-4329-a51a-29f757d8fe50', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 2, 50.00, 0.00, 100.00),
('c53cfd37-b696-4028-be4d-e894727083fa', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 2, 100.00, 0.00, 200.00),
('c53cfd37-b696-4028-be4d-e894727083fa', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 21, 100.00, 0.00, 2100.00),
('c53cfd37-b696-4028-be4d-e894727083fa', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 11, 300.00, 0.00, 3300.00),
('c53cfd37-b696-4028-be4d-e894727083fa', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 3, 50.00, 0.00, 150.00),
('c5c6bf61-be8c-4efd-8064-2b639b5e05e2', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('c97a9274-89fb-4c6d-bae2-a93eac01a202', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('c97a9274-89fb-4c6d-bae2-a93eac01a202', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('c988421e-32ac-4839-b491-dfafe11bc503', '27855f2a-b1a1-4c7a-9d61-f49cbc54b11f', 'Alloco', 1, 100.00, 0.00, 100.00),
('d151981f-97ce-4584-8c92-9da3bab3234a', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1000, 100.00, 0.00, 100000.00),
('d151981f-97ce-4584-8c92-9da3bab3234a', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 100, 500.00, 0.00, 50000.00),
('d3ed1000-0f26-45da-8d84-3675880509cf', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('d3ed1000-0f26-45da-8d84-3675880509cf', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('d577872a-3074-42e6-8f07-746f0e789ccb', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 5, 100.00, 0.00, 500.00),
('d577872a-3074-42e6-8f07-746f0e789ccb', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('d5e48dd4-7fe3-4d7f-90f0-dd9b933fa087', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('d5e48dd4-7fe3-4d7f-90f0-dd9b933fa087', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('d635dcd1-0821-44d3-a15a-637fcd057a2e', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4000, 100.00, 0.00, 400000.00),
('d635dcd1-0821-44d3-a15a-637fcd057a2e', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1000, 500.00, 0.00, 500000.00),
('dc148a30-e51a-4219-b399-feefe30532a6', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('dc148a30-e51a-4219-b399-feefe30532a6', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('dd74bc7b-e4f7-4c29-931a-1adbdd3ca2e9', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 10, 100.00, 0.00, 1000.00),
('dee9dfcf-265d-4b6a-af61-87bc3f12aa02', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('dee9dfcf-265d-4b6a-af61-87bc3f12aa02', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('df37cc8d-efe6-4c82-8dfd-0c7da60d69e6', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 1, 100.00, 0.00, 100.00),
('df37cc8d-efe6-4c82-8dfd-0c7da60d69e6', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('df92b96e-550f-40e6-8418-bc702618201f', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 4, 100.00, 0.00, 400.00),
('df92b96e-550f-40e6-8418-bc702618201f', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 2, 300.00, 0.00, 600.00),
('df92b96e-550f-40e6-8418-bc702618201f', 'e2f9933a-7f84-4f7f-872a-bb48dd5cdee6', 'Babali', 4, 50.00, 0.00, 200.00),
('e008e8d8-21cc-4239-ab05-e4b1edf9cf93', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('e008e8d8-21cc-4239-ab05-e4b1edf9cf93', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('e155707f-43f5-4e6c-9791-5ddac3404a7d', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('e1a614ea-1837-4263-8c16-7c405db46462', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('e1a614ea-1837-4263-8c16-7c405db46462', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('e2562c38-05a0-4108-b466-5cc43b72c911', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 31, 100.00, 0.00, 3100.00),
('e2562c38-05a0-4108-b466-5cc43b72c911', '6a6c916e-2e30-4782-9188-db0b89e8594d', 'Petit Fanta', 2, 200.00, 0.00, 400.00),
('e2562c38-05a0-4108-b466-5cc43b72c911', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 7, 300.00, 0.00, 2100.00),
('e3e0bd1f-26ca-4cf3-8293-8a3c885956d8', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('e527ac81-7a25-4018-8bfd-cc3715001af8', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('e527ac81-7a25-4018-8bfd-cc3715001af8', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('e760e65e-acb9-4b59-b655-dccd75dbd3e0', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 1, 200.00, 0.00, 200.00),
('e79fce98-821a-4c94-a272-61678faff6a2', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 6, 100.00, 0.00, 600.00),
('e79fce98-821a-4c94-a272-61678faff6a2', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 3, 300.00, 0.00, 900.00),
('eacc21b5-4e71-4230-9aa0-87e609b7b6de', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('eacc21b5-4e71-4230-9aa0-87e609b7b6de', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00),
('ed525877-fb6c-4f1f-98b4-5a9b5d6306ec', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('ed525877-fb6c-4f1f-98b4-5a9b5d6306ec', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('efffc936-015b-4c8f-8d46-4ba638802d1d', '68beeb70-aefa-430d-910e-9393bf58ff6c', 'Atiéké', 2, 100.00, 0.00, 200.00),
('efffc936-015b-4c8f-8d46-4ba638802d1d', 'b8194fa1-2aee-4e99-86a2-359829dbbfa2', 'Poisson', 1, 300.00, 0.00, 300.00),
('f0fbb4af-42a9-4fe0-8c35-00cf94bd3f4f', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('f1342a80-5932-4791-9812-145b92a29d52', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 300.00, 0.00, 300.00),
('f1f0eb66-7d4a-4a79-b31f-26ede3909ee5', 'b352d6dd-186c-4355-8fef-87c72e7f63cf', 'Chichard', 1, 650.00, 0.00, 650.00),
('f2044cf4-82c1-4b5e-a6d6-61b20764cef0', 'ac4dad72-40ef-40c2-a295-d43237dd65d3', 'test', 4, 300.00, 0.00, 1200.00),
('f2044cf4-82c1-4b5e-a6d6-61b20764cef0', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 4, 100.00, 0.00, 400.00),
('f2044cf4-82c1-4b5e-a6d6-61b20764cef0', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 2, 500.00, 0.00, 1000.00),
('fa6380ee-24ab-48c4-9c92-1e66144a6448', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('fa6380ee-24ab-48c4-9c92-1e66144a6448', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('fb60a909-43de-4e8b-83b5-a8ad428fee44', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 2, 100.00, 0.00, 200.00),
('fb659f44-c7a9-4c29-9b17-5ca1c44f8791', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 500.00, 0.00, 500.00),
('fd58b784-2940-4df1-ae61-7a4593292889', 'e00867bc-1457-4025-9d55-948963bffa3d', 'Attiéké', 30000, 100.00, 0.00, 3000000.00),
('fd58b784-2940-4df1-ae61-7a4593292889', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 3, 300.00, 0.00, 900.00),
('fdf0520f-64cf-4028-a4d0-314df896ec50', 'f49ef023-f4de-4c5b-960e-4c083656007c', 'Poisson', 1, 400.00, 0.00, 400.00);

-- --------------------------------------------------------

--
-- Structure de la table `shifts`
--

CREATE TABLE `shifts` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `openingAmount` decimal(10,2) DEFAULT NULL,
  `closingAmount` decimal(10,2) DEFAULT NULL,
  `expectedAmount` decimal(10,2) DEFAULT NULL,
  `difference` decimal(10,2) DEFAULT NULL,
  `cashAmount` decimal(10,2) DEFAULT NULL,
  `mobileMoneyAmount` decimal(10,2) DEFAULT NULL,
  `otherAmount` decimal(10,2) DEFAULT NULL,
  `openedAt` bigint(20) NOT NULL,
  `closedAt` bigint(20) DEFAULT NULL,
  `status` enum('open','closed') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `shifts`
--

INSERT INTO `shifts` (`id`, `userId`, `storeId`, `openingAmount`, `closingAmount`, `expectedAmount`, `difference`, `cashAmount`, `mobileMoneyAmount`, `otherAmount`, `openedAt`, `closedAt`, `status`) VALUES
('00f08a30-877c-4ef5-aadb-d6401de94f8c', 'ec44ac2c-5f48-4438-b066-61997babdbcd', '3d68e406-146c-4da2-97a2-8f605dcc0bd8', 50000.00, NULL, NULL, NULL, NULL, NULL, NULL, 1761305777377, NULL, 'open'),
('01d7454e-07cf-4bee-a7b0-889e0e80509a', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 100.00, 3200.00, 2200.00, 1000.00, NULL, NULL, NULL, 1760975755883, 1760975790958, 'closed'),
('0bf10426-7c99-483b-b349-70ce81a14a89', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761051208879, 1761131609134, 'closed'),
('0ce43346-a709-4a9a-b7ba-e35c21d56c68', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 5800.00, 90200.00, 5800.00, 84400.00, 200.00, 90000.00, 0.00, 1761195047323, 1761195061144, 'closed'),
('101e3001-b169-461b-89eb-9b7899d7a6dd', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761074076782, 1761131261866, 'closed'),
('18c9071e-931c-44fc-a997-cfc9754f716c', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 2000.00, 700.00, 2500.00, -1800.00, 400.00, 300.00, 0.00, 1760975970936, 1760976017928, 'closed'),
('1b7f5d8b-bda7-4551-8030-cb6bf215ce3f', 'c462c2ac-0a0f-471d-8400-3fb4b56ea240', '43f48260-9122-489d-ac9d-989a7d055e89', 5000.00, 6300.00, NULL, NULL, 6300.00, 0.00, 0.00, 1761235532511, 1761295490159, 'closed'),
('1ce1b3fa-b75b-4c63-ab9c-b0e15d7d9aeb', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 500.00, -500.00, 0.00, 0.00, 0.00, 1761011211585, 1761011291160, 'closed'),
('285b2702-09ac-4f1a-9a4e-b53b47956b71', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 5000.00, 800.00, 5000.00, -4200.00, NULL, NULL, NULL, 1760975274299, 1760975334260, 'closed'),
('286c2b9b-629b-4a0b-af3d-1b797b1d1726', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761266005678, 1761266106216, 'closed'),
('2d742c09-d420-4554-8edc-9c03dc187002', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 1380.00, 0.00, 1380.00, 580.00, 800.00, 0.00, 1761194420077, 1761194429555, 'closed'),
('309892b7-b9fd-4eb7-997d-8c9996c40510', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 500.00, NULL, NULL, 200.00, 300.00, 0.00, 1761136168966, 1761193047651, 'closed'),
('31f7824b-5663-4aa3-b46a-98807ac1b4f4', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761085775770, 1761247984478, 'closed'),
('32c6407e-e798-4b1f-9873-286886a53a8b', 'c462c2ac-0a0f-471d-8400-3fb4b56ea240', '43f48260-9122-489d-ac9d-989a7d055e89', 0.00, 0.00, 0.01, -0.01, 0.00, 0.00, 0.00, 1761234621384, 1761235495600, 'closed'),
('417539d4-3c07-4c12-bca5-d9fd31c70a8d', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 300.00, -300.00, 0.00, 0.00, 0.00, 1761011612040, 1761011638003, 'closed'),
('467e4973-49e2-4c0f-9876-839846edf89b', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 5000.00, 22000.00, NULL, NULL, 20100.00, 1900.00, 0.00, 1761227935246, 1761242698837, 'closed'),
('4c14fd5a-50db-4986-87d3-2537614a2f94', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 5000.00, NULL, NULL, NULL, NULL, NULL, NULL, 1761302771035, NULL, 'open'),
('4c8bbb78-f264-48cf-adf2-0db65696909c', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 5000.00, NULL, NULL, 5000.00, 0.00, 0.00, 1761226687190, 1761297162426, 'closed'),
('4de63a47-f418-47e7-9b18-b051fc8a9d7b', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761297173063, 1761297477184, 'closed'),
('6da8b002-5519-4522-9a3a-7b81267c01c7', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, 1761297645936, NULL, 'open'),
('7270a0f6-0efe-4a15-ab6f-b7eb3a04665f', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761222289219, 1761226678178, 'closed'),
('73222a86-06bf-490a-86b7-e104304dd489', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, NULL, NULL, NULL, 1760974427318, 1760975212605, 'closed'),
('84ce79f0-60ea-49ce-a153-985385705e42', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761221813127, 1761221819320, 'closed'),
('84e82505-d2fa-4558-9537-fd70190a1129', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761197230656, 1761197280543, 'closed'),
('87304af3-e0a0-40c8-830a-4e345c55d77e', '72be7130-c755-4f01-948d-28c6376dd1db', '43f48260-9122-489d-ac9d-989a7d055e89', 2950.00, NULL, NULL, NULL, NULL, NULL, NULL, 1761234244164, NULL, 'open'),
('8b5bea33-7aef-412f-9f25-bc31e7cd1b44', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761222126990, 1761222132821, 'closed'),
('8c61e82a-1cf7-4e01-bd5d-e5bb03520471', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 300200.00, -300200.00, 0.00, 0.00, 0.00, 1761011314909, 1761011487629, 'closed'),
('a421a677-8cd0-419a-b2ea-0e316d0ea530', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761195372839, 1761195378506, 'closed'),
('a43c4c5b-045d-4c0f-8f64-7d10e7e2d995', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761137206014, 1761280840098, 'closed'),
('a97cf4fd-e5f3-408b-b283-dd1eeb4285e1', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 100.00, 500.00, 100.01, 400.00, 500.00, 0.00, 0.00, 1761265890823, 1761265924628, 'closed'),
('aa130c58-43d6-4321-8935-1eb22372e15d', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761281434859, 1761281443584, 'closed'),
('be78f8fc-004f-4627-ae52-54d241f3faa0', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, NULL, NULL, NULL, NULL, NULL, NULL, 1761266108710, NULL, 'open'),
('c5de1f3f-9ad7-4a64-9ffe-b5cef98de1c6', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761043674201, 1761045201340, 'closed'),
('cc3bc1e4-18b1-40d2-9ce1-23a99af76151', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761045579514, 1761265778801, 'closed'),
('d2d3fe27-deab-4c87-8a91-f1fdc26489a4', '6624110f-940a-4911-9576-943a439a0106', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761280848594, 1761280853615, 'closed'),
('dfec1488-c455-4033-b75b-021f8c0a4257', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 1761045236093, 1761045365903, 'closed'),
('e0b9f1db-b05c-4a17-aa19-36da0e2493a2', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, 700.00, -700.00, 0.00, 0.00, 0.00, 1761011577857, 1761011593765, 'closed'),
('e38bad73-bc71-4131-b4dc-05f610f5a450', '49883920-b149-4424-a801-de2cdfc9ae5d', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 123456.00, 123456.00, 123456.00, 0.00, 123456.00, 0.00, 0.00, 1761242813416, 1761302699690, 'closed'),
('e5704248-21ae-4ba1-93cc-acfc03ffc0ad', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 1100.00, 0.00, 1100.00, NULL, NULL, NULL, 1760975508577, 1760975559397, 'closed'),
('eabf6805-bf3b-476f-9b2f-65badad72c27', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 0.00, 0.00, NULL, NULL, 0.00, 0.00, 0.00, 1761011717302, 1761051188478, 'closed'),
('f623a823-f1c2-4b36-b0cf-c5afc5054b0c', 'f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 5000.00, 35700.00, NULL, NULL, 30150.00, 5550.00, 0.00, 1761248176399, 1761265490974, 'closed');

-- --------------------------------------------------------

--
-- Structure de la table `stock_signals`
--

CREATE TABLE `stock_signals` (
  `id` varchar(36) NOT NULL,
  `expenseId` varchar(36) DEFAULT NULL,
  `productId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `startDate` bigint(20) DEFAULT NULL,
  `endDate` bigint(20) DEFAULT NULL,
  `purchaseAmount` decimal(10,2) DEFAULT NULL,
  `quantityBought` int(11) DEFAULT NULL,
  `quantitySold` int(11) DEFAULT NULL,
  `revenue` decimal(10,2) DEFAULT NULL,
  `margin` decimal(10,2) DEFAULT NULL,
  `realMargin` decimal(15,2) DEFAULT 0.00,
  `marginPercentage` decimal(5,2) DEFAULT NULL,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `stock_signals`
--

INSERT INTO `stock_signals` (`id`, `expenseId`, `productId`, `userId`, `storeId`, `startDate`, `endDate`, `purchaseAmount`, `quantityBought`, `quantitySold`, `revenue`, `margin`, `realMargin`, `marginPercentage`, `createdAt`) VALUES
('677af86e-1cee-44b0-a9a2-848ecf0aa5fd', '356b9e6a-993d-4c7e-8356-be464dccca38', 'e00867bc-1457-4025-9d55-948963bffa3d', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1761011847401, 1761013965455, 30000.00, 1, 100, 10000.00, -20000.00, -20000.00, -200.00, 1761013965455),
('697b3ac3-daa6-4b46-8c64-b4bbb014c0eb', 'ec4b2231-d0df-4cf6-9007-3bd3a5fcae58', '01ea34cd-b867-4b36-ac4d-575660c0e940', '8af0ef09-cfef-43db-a0e7-b593e87276d4', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1760978640000, 1761043330690, 18000.00, 1, 2, 800.00, -17200.00, -17200.00, -999.99, 1761043330690),
('c2d192de-6ba3-4f92-9a61-707ba379f215', 'f5a7a6d6-62f3-4546-9256-aa7d55df6f14', 'e00867bc-1457-4025-9d55-948963bffa3d', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1761036769661, 1761037233655, 10000.00, 1, 0, 0.00, -20000.00, -10000.00, -100.00, 1761037233655),
('f0a31638-de13-4cec-9f57-00cd2927e83f', 'ec4b2231-d0df-4cf6-9007-3bd3a5fcae58', '01ea34cd-b867-4b36-ac4d-575660c0e940', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1760978640000, 1761036651821, 18000.00, 1, 2, 800.00, -17200.00, -17200.00, -999.99, 1761036651821),
('f7e2ceb2-6bbf-4895-98f9-f59772bacdc8', 'eab487c2-3ff9-4188-a73a-9dbbf6aa4428', 'e00867bc-1457-4025-9d55-948963bffa3d', '400218e2-eaec-4572-a304-adae02c8a693', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1761014100000, 1761036709661, 30000.00, 1, 0, 0.00, -30000.00, -30000.00, 0.00, 1761036709661);

-- --------------------------------------------------------

--
-- Structure de la table `stores`
--

CREATE TABLE `stores` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL,
  `subscriptionStart` bigint(20) DEFAULT NULL,
  `subscriptionEnd` bigint(20) DEFAULT NULL,
  `lastPayment` bigint(20) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `stores`
--

INSERT INTO `stores` (`id`, `name`, `address`, `active`, `createdAt`, `subscriptionStart`, `subscriptionEnd`, `lastPayment`, `logo`) VALUES
('3d68e406-146c-4da2-97a2-8f605dcc0bd8', 'PLAYSTATION', 'Sondogo', 1, 1761158114917, 1761158114917, 1763750114917, 1761158114917, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68f923e288859.png'),
('43f48260-9122-489d-ac9d-989a7d055e89', 'POISSONNERIE CHEZ ASSI', 'Sondogo, secteur 32', 1, 1761233517336, 1761233517336, 1763825517336, 1761233517336, NULL),
('4b7fd856-8cbd-471c-aec5-e98792c5c500', '', NULL, 1, 1761300451573, NULL, NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fb4fe427bff.png'),
('c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', '', NULL, 1, 1761272025209, NULL, NULL, NULL, 'https://mediumslateblue-cod-399211.hostingersite.com/backend/img_products/68fae0da29794.png');

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `username` varchar(50) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `password` varchar(255) NOT NULL,
  `pin` varchar(255) DEFAULT NULL,
  `role` enum('super_admin','admin','cashier') NOT NULL,
  `storeId` varchar(36) DEFAULT NULL,
  `active` tinyint(1) DEFAULT 1,
  `createdAt` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `users`
--

INSERT INTO `users` (`id`, `username`, `phone`, `password`, `pin`, `role`, `storeId`, `active`, `createdAt`) VALUES
('400218e2-eaec-4572-a304-adae02c8a693', 'Admin A', '+22611111111', '123456', '1234', 'admin', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760705398364),
('49883920-b149-4424-a801-de2cdfc9ae5d', 'Fatim', '+22667018459', '123456', '8090', 'cashier', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761072073026),
('6624110f-940a-4911-9576-943a439a0106', 'Azim', '+22657007220', '081102', '0000', 'admin', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761071878675),
('72be7130-c755-4f01-948d-28c6376dd1db', 'Madame Somé', '+22667091515', '123456', '1234', 'cashier', '43f48260-9122-489d-ac9d-989a7d055e89', 1, 1761233919709),
('8af0ef09-cfef-43db-a0e7-b593e87276d4', 'Caissier A', '+22621111111', '123456', '1234', 'cashier', 'c7c8bd04-6ceb-4ae4-9491-5f832150d4a2', 1, 1760967214644),
('c462c2ac-0a0f-471d-8400-3fb4b56ea240', 'POISONERIE ADMIN', '+22672210216', '081102', '0000', 'admin', '43f48260-9122-489d-ac9d-989a7d055e89', 1, 1761233518547),
('ec44ac2c-5f48-4438-b066-61997babdbcd', 'Rachid', '+22665253595', 'SERVICE', '1234', 'admin', '3d68e406-146c-4da2-97a2-8f605dcc0bd8', 1, 1761080674261),
('f2875e79-07dd-414c-90a6-7c4ba68cdd06', 'Super Admin', '+22600000000', '123456', '0000', 'super_admin', NULL, 1, 1760705580090),
('f72a98d7-0f7d-42f4-b7d1-0c4515ab0a6a', 'Diarra', '+22665947253', '123456', '9999', 'cashier', '4b7fd856-8cbd-471c-aec5-e98792c5c500', 1, 1761071958291);

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `expenses_advanced`
--
ALTER TABLE `expenses_advanced`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `sku` (`sku`);

--
-- Index pour la table `product_stock`
--
ALTER TABLE `product_stock`
  ADD PRIMARY KEY (`productId`,`storeId`);

--
-- Index pour la table `sales`
--
ALTER TABLE `sales`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `sale_items`
--
ALTER TABLE `sale_items`
  ADD PRIMARY KEY (`saleId`,`productId`);

--
-- Index pour la table `shifts`
--
ALTER TABLE `shifts`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `stock_signals`
--
ALTER TABLE `stock_signals`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `stores`
--
ALTER TABLE `stores`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `phone` (`phone`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
