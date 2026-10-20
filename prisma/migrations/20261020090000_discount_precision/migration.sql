-- Higher precision for discounts so that list price × (1 − discount) reproduces
-- the exact discounted price from Peverelli price lists.
ALTER TABLE "InventoryItem" ALTER COLUMN "discountPct" TYPE DECIMAL(9,6);
ALTER TABLE "QuotationItem" ALTER COLUMN "discountPct" TYPE DECIMAL(9,6);
