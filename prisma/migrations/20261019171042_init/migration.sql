-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('SHOWROOM', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'CHF');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('FRONTALE', 'LATERALE', 'DETTAGLIO', 'AMBIENTE', 'SHOWROOM');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('ESPOSTO', 'DISPONIBILE', 'RISERVATO', 'VENDUTO', 'IN_TRASFERIMENTO', 'NON_DISPONIBILE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CATALOGO_PRODOTTO', 'CATALOGO_GENERALE', 'SCHEDA_TECNICA', 'LISTINO_PREZZI', 'MATERIALI_FINITURE', 'ISTRUZIONI_MONTAGGIO', 'ALTRO');

-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('IT', 'EN', 'DE', 'FR', 'MULTI');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('BOZZA', 'INVIATO', 'IN_TRATTATIVA', 'ACCETTATO', 'RIFIUTATO');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULENZA_ARREDO', 'PROGETTO_CUCINA', 'INTERIOR_DESIGN', 'VISITA_SHOWROOM', 'PRESENTAZIONE_PREVENTIVO', 'APPUNTAMENTO_ARCHITETTO');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFERMATO', 'ANNULLATO', 'COMPLETATO');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('INTERNO', 'PUBBLICO');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('BASSA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('BOZZA', 'INVIATA', 'ERRORE');

-- CreateTable
CREATE TABLE "Role" (
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleKey" "RoleKey" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "defaultLocationId" TEXT,
    "activeQuotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "designer" TEXT,
    "year" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "dimensions" TEXT,
    "widthCm" INTEGER,
    "depthCm" INTEGER,
    "heightCm" INTEGER,
    "listPrice" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "configurationId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL DEFAULT 'FRONTALE',
    "caption" TEXT,
    "credit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductConfiguration" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "dimensions" TEXT,
    "widthCm" INTEGER,
    "depthCm" INTEGER,
    "heightCm" INTEGER,
    "price" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "source" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brandId" TEXT,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finish" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "hexColor" TEXT NOT NULL DEFAULT '#CCCCCC',

    CONSTRAINT "Finish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCompatibility" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "finishId" TEXT,
    "priceDelta" DECIMAL(12,2),

    CONSTRAINT "ConfigurationCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","productModelId")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "configurationId" TEXT,
    "composition" TEXT,
    "materialId" TEXT,
    "finishId" TEXT,
    "materialsDescription" TEXT,
    "dimensions" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "locationId" TEXT NOT NULL,
    "zoneId" TEXT,
    "status" "InventoryStatus" NOT NULL DEFAULT 'DISPONIBILE',
    "baseStatus" "InventoryStatus" NOT NULL DEFAULT 'DISPONIBILE',
    "transferToId" TEXT,
    "price" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImage" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "language" "DocumentLanguage" NOT NULL,
    "brandId" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "checksum" TEXT NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocumentLink" (
    "documentId" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "startPage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDocumentLink_pkey" PRIMARY KEY ("documentId","productModelId")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "city" TEXT,
    "preferredLocationId" TEXT,
    "consultantId" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientInterest" (
    "clientId" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientInterest_pkey" PRIMARY KEY ("clientId","productModelId")
);

-- CreateTable
CREATE TABLE "ShowroomVisit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT NOT NULL,
    "consultantId" TEXT,
    "budget" TEXT,
    "projectType" TEXT,
    "timeline" TEXT,
    "preferences" TEXT,
    "notes" TEXT,
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowroomVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitProduct" (
    "visitId" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,

    CONSTRAINT "VisitProduct_pkey" PRIMARY KEY ("visitId","productModelId")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "title" TEXT,
    "clientId" TEXT,
    "visitId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'BOZZA',
    "currency" "Currency" NOT NULL DEFAULT 'CHF',
    "exchangeRate" DECIMAL(10,5),
    "exchangeSource" TEXT,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "transportCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installationCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productModelId" TEXT,
    "configurationId" TEXT,
    "inventoryItemId" TEXT,
    "brandName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "description" TEXT,
    "configLabel" TEXT,
    "materials" TEXT,
    "dimensions" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "locationId" TEXT NOT NULL,
    "consultantId" TEXT,
    "type" "AppointmentType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFERMATO',
    "source" "AppointmentSource" NOT NULL DEFAULT 'INTERNO',
    "notes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ConsultantAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "quotationId" TEXT,
    "template" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachPdf" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmailStatus" NOT NULL DEFAULT 'BOZZA',
    "error" TEXT,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_locationId_name_key" ON "Zone"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModel_code_key" ON "ProductModel"("code");

-- CreateIndex
CREATE INDEX "ProductModel_brandId_idx" ON "ProductModel"("brandId");

-- CreateIndex
CREATE INDEX "ProductModel_categoryId_idx" ON "ProductModel"("categoryId");

-- CreateIndex
CREATE INDEX "ProductModel_name_idx" ON "ProductModel"("name");

-- CreateIndex
CREATE INDEX "ProductImage_productModelId_idx" ON "ProductImage"("productModelId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductConfiguration_productModelId_name_key" ON "ProductConfiguration"("productModelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_brandId_key" ON "Material"("name", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Finish_materialId_name_key" ON "Finish"("materialId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationCompatibility_configurationId_materialId_finis_key" ON "ConfigurationCompatibility"("configurationId", "materialId", "finishId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE INDEX "InventoryItem_productModelId_idx" ON "InventoryItem"("productModelId");

-- CreateIndex
CREATE INDEX "InventoryItem_locationId_status_idx" ON "InventoryItem"("locationId", "status");

-- CreateIndex
CREATE INDEX "Reservation_inventoryItemId_status_idx" ON "Reservation"("inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "Reservation_clientId_idx" ON "Reservation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ProductDocumentLink_productModelId_idx" ON "ProductDocumentLink"("productModelId");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "ShowroomVisit_clientId_idx" ON "ShowroomVisit"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE INDEX "Quotation_clientId_idx" ON "Quotation"("clientId");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "Appointment_locationId_startsAt_idx" ON "Appointment"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_consultantId_startsAt_idx" ON "Appointment"("consultantId", "startsAt");

-- CreateIndex
CREATE INDEX "ConsultantAvailability_locationId_weekday_idx" ON "ConsultantAvailability"("locationId", "weekday");

-- CreateIndex
CREATE INDEX "Task_assigneeId_completed_idx" ON "Task"("assigneeId", "completed");

-- CreateIndex
CREATE INDEX "EmailMessage_clientId_idx" ON "EmailMessage"("clientId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleKey_fkey" FOREIGN KEY ("roleKey") REFERENCES "Role"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProductConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductConfiguration" ADD CONSTRAINT "ProductConfiguration_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finish" ADD CONSTRAINT "Finish_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCompatibility" ADD CONSTRAINT "ConfigurationCompatibility_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProductConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCompatibility" ADD CONSTRAINT "ConfigurationCompatibility_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCompatibility" ADD CONSTRAINT "ConfigurationCompatibility_finishId_fkey" FOREIGN KEY ("finishId") REFERENCES "Finish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProductConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_finishId_fkey" FOREIGN KEY ("finishId") REFERENCES "Finish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_transferToId_fkey" FOREIGN KEY ("transferToId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImage" ADD CONSTRAINT "InventoryImage_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocumentLink" ADD CONSTRAINT "ProductDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocumentLink" ADD CONSTRAINT "ProductDocumentLink_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_preferredLocationId_fkey" FOREIGN KEY ("preferredLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInterest" ADD CONSTRAINT "ClientInterest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientInterest" ADD CONSTRAINT "ClientInterest_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowroomVisit" ADD CONSTRAINT "ShowroomVisit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowroomVisit" ADD CONSTRAINT "ShowroomVisit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowroomVisit" ADD CONSTRAINT "ShowroomVisit_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitProduct" ADD CONSTRAINT "VisitProduct_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ShowroomVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitProduct" ADD CONSTRAINT "VisitProduct_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ShowroomVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "ProductConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAvailability" ADD CONSTRAINT "ConsultantAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAvailability" ADD CONSTRAINT "ConsultantAvailability_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
