-- Which factors a risk model rates, and how, kept on the model itself.
--
-- Probability and consequence of failure were rated on factors written into
-- the code: condition, age, failure history and material; customers served,
-- criticality, diameter and customer type, each with fixed thresholds or a
-- table of ratings. Each asset type's risk model now holds its own, so another
-- asset class can be rated on its own factors.
--
-- The waterline's whole-asset risk models get exactly the factors the code
-- used, so every score - and the factor text each assessment records - is
-- unchanged. Models that only hold component scores are left alone, as are a
-- model's weights: they stay where they are, keyed by the same factors.

UPDATE "risk_models" r
SET "probabilityConfig" = r."probabilityConfig" || jsonb_build_object('factors', '[{"key": "CONDITION", "name": "Condition", "label": "Condition (WCI)", "source": "condition", "breakpoints": [15, 30, 50, 75], "prefix": "WCI ", "defaultWeight": 0.4}, {"key": "AGE", "name": "Age", "label": "Age vs expected life", "source": "ageRatio", "breakpoints": [0.35, 0.55, 0.75, 0.95], "defaultWeight": 0.25}, {"key": "FAILURE_HISTORY", "name": "Failure History", "label": "Failure history (10 yr)", "source": "failures", "breakpoints": [1, 2, 3, 4], "defaultWeight": 0.25}, {"key": "MATERIAL", "name": "Material", "source": "material", "ratings": {"Asbestos Cement": 5, "Cast Iron": 4, "Steel": 3, "Copper": 3, "Ductile Iron": 2, "HDPE": 1, "PVC": 1}, "defaultWeight": 0.1}]'::jsonb)
FROM "asset_types" t
WHERE t."id" = r."assetTypeId"
  AND t."code" = 'WATERLINE'
  AND COALESCE(r."probabilityConfig"->>'scope', '') <> 'component'
  AND NOT (r."probabilityConfig" ? 'factors');

UPDATE "risk_models" r
SET "consequenceConfig" = r."consequenceConfig" || jsonb_build_object('factors', '[{"key": "CUSTOMERS_SERVED", "name": "Customers Served", "label": "Customers served", "source": "customersServed", "breakpoints": [50, 120, 250, 400], "defaultWeight": 0.35}, {"key": "CRITICALITY", "name": "Criticality", "source": "criticality", "ratings": {"Critical": 5, "High": 4, "Moderate": 3, "Low": 1}, "defaultWeight": 0.3}, {"key": "DIAMETER", "name": "Diameter", "source": "diameter", "breakpoints": [6, 10, 16, 20], "suffix": "\"", "defaultWeight": 0.2}, {"key": "CUSTOMER_TYPE", "name": "Customer Type", "label": "Customer type", "source": "customerType", "ratings": {"Institutional": 5, "Industrial": 4, "Commercial": 3, "Mixed": 3, "Residential": 2}, "defaultWeight": 0.15}]'::jsonb)
FROM "asset_types" t
WHERE t."id" = r."assetTypeId"
  AND t."code" = 'WATERLINE'
  AND COALESCE(r."probabilityConfig"->>'scope', '') <> 'component'
  AND NOT (r."consequenceConfig" ? 'factors');

-- Refuse rather than leave a modelled type's risk model rating nothing of its
-- own: every whole-asset risk model of a modelled type with assets must now
-- hold its factors.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(DISTINCT t."name" || ' (' || r."name" || ')', ', ') INTO missing
  FROM "risk_models" r
  JOIN "asset_types" t ON t."id" = r."assetTypeId"
  WHERE t."isModelled" = true
    AND COALESCE(r."probabilityConfig"->>'scope', '') <> 'component'
    AND EXISTS (SELECT 1 FROM "assets" a WHERE a."assetTypeId" = t."id")
    AND (NOT (r."probabilityConfig" ? 'factors') OR NOT (r."consequenceConfig" ? 'factors'));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Risk models left without factors: %', missing;
  END IF;
END $$;
