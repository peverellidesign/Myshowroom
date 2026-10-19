-- Database-level integrity rules (enforced regardless of the application layer).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "InventoryItem" ADD CONSTRAINT "inventory_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "inventory_discount_range" CHECK ("discountPct" >= 0 AND "discountPct" <= 100);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "inventory_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "Reservation" ADD CONSTRAINT "reservation_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "QuotationItem" ADD CONSTRAINT "quotation_item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "QuotationItem" ADD CONSTRAINT "quotation_item_discount_range" CHECK ("discountPct" >= 0 AND "discountPct" <= 100);
ALTER TABLE "Quotation" ADD CONSTRAINT "quotation_discount_range" CHECK ("discountPct" >= 0 AND "discountPct" <= 100);
ALTER TABLE "Appointment" ADD CONSTRAINT "appointment_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ConsultantAvailability" ADD CONSTRAINT "availability_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute" AND "weekday" BETWEEN 1 AND 7);

-- A consultant can never have two overlapping confirmed appointments.
ALTER TABLE "Appointment" ADD CONSTRAINT "appointment_no_consultant_overlap"
  EXCLUDE USING gist ("consultantId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("consultantId" IS NOT NULL AND "status" = 'CONFERMATO');

-- Over-reservation guard: active reservations can never exceed the physical quantity.
CREATE OR REPLACE FUNCTION check_reservation_capacity() RETURNS trigger AS $$
DECLARE
  reserved INT;
  available INT;
  item_status "InventoryStatus";
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  SELECT "quantity", "status" INTO available, item_status FROM "InventoryItem" WHERE "id" = NEW."inventoryItemId" FOR UPDATE;
  IF item_status IN ('VENDUTO', 'NON_DISPONIBILE', 'IN_TRASFERIMENTO') THEN
    RAISE EXCEPTION 'INVENTORY_NOT_RESERVABLE' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(SUM("quantity"), 0) INTO reserved FROM "Reservation"
    WHERE "inventoryItemId" = NEW."inventoryItemId" AND "status" = 'ACTIVE' AND "id" <> NEW."id";
  IF reserved + NEW."quantity" > available THEN
    RAISE EXCEPTION 'RESERVATION_CAPACITY_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_capacity_guard
  BEFORE INSERT OR UPDATE OF "status", "quantity" ON "Reservation"
  FOR EACH ROW EXECUTE FUNCTION check_reservation_capacity();
