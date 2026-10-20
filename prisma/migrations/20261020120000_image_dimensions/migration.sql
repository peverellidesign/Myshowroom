-- Image dimensions, used by the UI to choose between cropping and fitting a photo.
ALTER TABLE "ProductImage" ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER;
ALTER TABLE "InventoryImage" ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER;
