-- CreateTable
CREATE TABLE "navigation_labels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navigation_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "navigation_labels_organizationId_href_key" ON "navigation_labels"("organizationId", "href");
