-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ENUM');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ABANDONED', 'PLANNED', 'REMOVED');

-- CreateEnum
CREATE TYPE "DeteriorationModelType" AS ENUM ('LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'LOGISTIC', 'MARKOV', 'EMPIRICAL', 'REGRESSION');

-- CreateEnum
CREATE TYPE "WorkPlanItemStatus" AS ENUM ('PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETE', 'DEFERRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_attribute_definitions" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "AttributeDataType" NOT NULL,
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,

    CONSTRAINT "asset_attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT,
    "parentAssetId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerDepartment" TEXT,
    "installationDate" TIMESTAMP(3),
    "expectedUsefulLife" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_attribute_values" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,

    CONSTRAINT "asset_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_relationships" (
    "id" TEXT NOT NULL,
    "assetAId" TEXT NOT NULL,
    "assetBId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "asset_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_locations" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "geometry" geometry(Geometry,4326) NOT NULL,
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "endLat" DOUBLE PRECISION,
    "endLng" DOUBLE PRECISION,
    "depth" DOUBLE PRECISION,
    "serviceArea" TEXT,
    "pressureZone" TEXT,

    CONSTRAINT "asset_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_template_fields" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "AttributeDataType" NOT NULL,
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,

    CONSTRAINT "inspection_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "requiresFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_results" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "dateValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,

    CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_attachments" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_models" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scaleMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scaleMax" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "bands" JSONB NOT NULL,
    "formula" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "condition_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_measurements" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "conditionModelId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "measurementDate" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL,

    CONSTRAINT "condition_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_types" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "failure_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "failureTypeId" TEXT NOT NULL,
    "failureDate" TIMESTAMP(3) NOT NULL,
    "severity" TEXT,
    "cause" TEXT,
    "repairCost" DOUBLE PRECISION,
    "downtimeHours" DOUBLE PRECISION,
    "customersAffected" INTEGER,
    "restorationTime" DOUBLE PRECISION,
    "consequenceNotes" TEXT,

    CONSTRAINT "failure_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deterioration_models" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelType" "DeteriorationModelType" NOT NULL,
    "applicability" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deterioration_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deterioration_parameters" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "deterioration_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deterioration_predictions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "forecastYear" INTEGER NOT NULL,
    "predictedCondition" DOUBLE PRECISION NOT NULL,
    "scenario" TEXT,
    "observedCondition" DOUBLE PRECISION,
    "predictionError" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "calibrationDate" TIMESTAMP(3),

    CONSTRAINT "deterioration_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_models" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "probabilityConfig" JSONB NOT NULL,
    "consequenceConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "risk_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "riskModelId" TEXT NOT NULL,
    "probabilityScore" DOUBLE PRECISION NOT NULL,
    "consequenceScore" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factors" (
    "id" TEXT NOT NULL,
    "riskAssessmentId" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "factorValue" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "risk_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criticality_scores" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "criticality_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatments" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "applicableConditionMin" DOUBLE PRECISION,
    "applicableConditionMax" DOUBLE PRECISION,
    "applicability" JSONB,
    "expectedLifeExtension" INTEGER,
    "effectOnCondition" DOUBLE PRECISION,
    "effectOnFailureProb" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "costUnit" TEXT,
    "mobilizationCost" DOUBLE PRECISION,
    "annualMaintenanceCost" DOUBLE PRECISION,
    "usefulLife" INTEGER,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_rules" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "condition" JSONB NOT NULL,

    CONSTRAINT "treatment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_costs" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "costType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3),

    CONSTRAINT "treatment_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_assumptions" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "scenario_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_results" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "scenario_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plans" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plan_items" (
    "id" TEXT NOT NULL,
    "workPlanId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "expectedBenefit" JSONB,
    "reasonExplanation" TEXT,
    "fundingSource" TEXT,
    "status" "WorkPlanItemStatus" NOT NULL DEFAULT 'PLANNED',

    CONSTRAINT "work_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetId" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "incurredAt" TIMESTAMP(3),

    CONSTRAINT "costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "title" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_code_key" ON "asset_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_attribute_definitions_assetTypeId_code_key" ON "asset_attribute_definitions"("assetTypeId", "code");

-- CreateIndex
CREATE INDEX "assets_assetTypeId_idx" ON "assets"("assetTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organizationId_assetCode_key" ON "assets"("organizationId", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "asset_attribute_values_assetId_definitionId_key" ON "asset_attribute_values"("assetId", "definitionId");

-- CreateIndex
CREATE INDEX "asset_relationships_assetAId_idx" ON "asset_relationships"("assetAId");

-- CreateIndex
CREATE INDEX "asset_relationships_assetBId_idx" ON "asset_relationships"("assetBId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_locations_assetId_key" ON "asset_locations"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_template_fields_templateId_code_key" ON "inspection_template_fields"("templateId", "code");

-- CreateIndex
CREATE INDEX "inspections_assetId_idx" ON "inspections"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_results_inspectionId_fieldId_key" ON "inspection_results"("inspectionId", "fieldId");

-- CreateIndex
CREATE INDEX "condition_measurements_assetId_idx" ON "condition_measurements"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "failure_types_assetTypeId_code_key" ON "failure_types"("assetTypeId", "code");

-- CreateIndex
CREATE INDEX "failure_events_assetId_idx" ON "failure_events"("assetId");

-- CreateIndex
CREATE INDEX "deterioration_predictions_assetId_idx" ON "deterioration_predictions"("assetId");

-- CreateIndex
CREATE INDEX "risk_assessments_assetId_idx" ON "risk_assessments"("assetId");

-- CreateIndex
CREATE INDEX "criticality_scores_assetId_idx" ON "criticality_scores"("assetId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attribute_definitions" ADD CONSTRAINT "asset_attribute_definitions_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attribute_values" ADD CONSTRAINT "asset_attribute_values_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_attribute_values" ADD CONSTRAINT "asset_attribute_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "asset_attribute_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_assetAId_fkey" FOREIGN KEY ("assetAId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_relationships" ADD CONSTRAINT "asset_relationships_assetBId_fkey" FOREIGN KEY ("assetBId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_locations" ADD CONSTRAINT "asset_locations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_template_fields" ADD CONSTRAINT "inspection_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "inspection_template_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_attachments" ADD CONSTRAINT "inspection_attachments_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_models" ADD CONSTRAINT "condition_models_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_measurements" ADD CONSTRAINT "condition_measurements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_measurements" ADD CONSTRAINT "condition_measurements_conditionModelId_fkey" FOREIGN KEY ("conditionModelId") REFERENCES "condition_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_measurements" ADD CONSTRAINT "condition_measurements_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_types" ADD CONSTRAINT "failure_types_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_events" ADD CONSTRAINT "failure_events_failureTypeId_fkey" FOREIGN KEY ("failureTypeId") REFERENCES "failure_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deterioration_models" ADD CONSTRAINT "deterioration_models_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deterioration_parameters" ADD CONSTRAINT "deterioration_parameters_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "deterioration_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deterioration_predictions" ADD CONSTRAINT "deterioration_predictions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deterioration_predictions" ADD CONSTRAINT "deterioration_predictions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "deterioration_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_models" ADD CONSTRAINT "risk_models_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_riskModelId_fkey" FOREIGN KEY ("riskModelId") REFERENCES "risk_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_factors" ADD CONSTRAINT "risk_factors_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criticality_scores" ADD CONSTRAINT "criticality_scores_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_rules" ADD CONSTRAINT "treatment_rules_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_costs" ADD CONSTRAINT "treatment_costs_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_assumptions" ADD CONSTRAINT "scenario_assumptions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_results" ADD CONSTRAINT "scenario_results_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "work_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costs" ADD CONSTRAINT "costs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
