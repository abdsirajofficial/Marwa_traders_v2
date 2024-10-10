-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `mrp` DOUBLE NOT NULL,
    `discount` DOUBLE NOT NULL,
    `addMargin` DOUBLE NOT NULL,
    `netRate` DOUBLE NOT NULL,
    `category` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceNumber` INTEGER NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `gst` INTEGER NOT NULL,
    `spl` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `discount` DOUBLE NOT NULL,
    `mrp` DOUBLE NOT NULL,
    `netRate` DOUBLE NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
