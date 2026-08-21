# Build CARNAC — Universal Asset Management & Decision Support Platform

Build a full-stack web application called **CARNAC**.

CARNAC stands for a general-purpose **asset management system** designed to collect, store, analyze, model, forecast, and report on the condition and performance of infrastructure assets.

The architecture must be **asset-type agnostic**, but the **first and only asset type implemented in this initial version is WATERLINES**.

**Do not implement pavement, bridges, roads, highways, or transportation assets. Do not create pavement- or bridge-specific terminology, fields, workflows, or screens.** The system should be designed so those asset types could potentially be added later without redesigning the core architecture.

Use the attached UI screenshot as a **visual design reference only**. The screenshot shows a pavement-management-style executive dashboard. Recreate the overall design quality, information hierarchy, navigation style, cards, charts, map presentation, and professional asset-management feel, but adapt all functionality and terminology to **waterline asset management**.

---

# 1. Product Vision

CARNAC should ultimately provide an organization with a single system to answer:

* What assets do we own?
* Where are they?
* What condition are they in?
* What inspections have been performed?
* What defects or deficiencies exist?
* How is condition expected to deteriorate?
* What is the probability and consequence of failure?
* What is the risk associated with each asset?
* What maintenance, rehabilitation, renewal, or replacement should we perform?
* When should we perform it?
* How much will it cost?
* What happens if we defer the work?
* What is the optimal long-term investment strategy?
* How will the asset network perform under different funding scenarios?

The core concept is:

**Inventory → Inspection → Condition → Deterioration → Risk → Treatment → Cost → Optimization → Work Plan → Reporting**

The system should connect these components rather than treating them as separate modules.

---

# 2. Technology Stack

Use a modern production-quality web stack.

Preferred stack:

* **Frontend:** Next.js + React + TypeScript
* **UI:** Tailwind CSS + shadcn/ui
* **Backend:** Next.js server/API architecture or a clean REST API layer
* **Database:** PostgreSQL
* **ORM:** Prisma or Drizzle
* **GIS:** PostGIS
* **Charts:** Recharts, ECharts, or another high-quality React charting library
* **Maps:** MapLibre GL JS or another modern web mapping library
* **Authentication:** Role-based authentication
* **Validation:** Zod or equivalent
* **Forms:** React Hook Form or equivalent

Prioritize a clean architecture where the frontend, business logic, database, and analytics/modeling components are logically separated.

Use migrations and seed data.

The application should be able to run locally with a straightforward setup.

---

# 3. Core Architecture Principle: Asset-Type Agnostic

Do not hard-code the entire system around waterlines.

Instead, create a core asset-management framework with concepts such as:

* Asset Type
* Asset
* Asset Component
* Attribute
* Inspection
* Inspection Result
* Condition Measure
* Performance Measure
* Defect
* Failure Mode
* Deterioration Model
* Treatment
* Treatment Rule
* Risk Model
* Consequence
* Cost
* Scenario
* Work Plan
* Project
* Forecast
* Reporting Metric

Waterlines should then be implemented as the first asset type using this framework.

For example:

```text
Asset Type
    └── Waterline

Waterline
    ├── Inventory
    ├── Spatial Location
    ├── Physical Attributes
    ├── Inspection History
    ├── Condition
    ├── Defects
    ├── Failure History
    ├── Deterioration Model
    ├── Risk
    ├── Treatments
    ├── Cost
    └── Forecast
```

Avoid creating database structures such as `BridgeAsset`, `PavementSection`, etc.

Instead, use generic entities such as `Asset`, `AssetType`, `Inspection`, `ConditionMeasure`, and `Treatment`.

Waterline-specific attributes can be represented through an extensible attribute model where appropriate.

---

# 4. Initial Asset Type: WATERLINES

The first implementation should focus exclusively on water distribution lines.

A waterline should support attributes such as:

### Identification

* Asset ID
* Facility/Network ID
* Segment ID
* Parent Asset
* Asset Type
* Status
* Owner
* Responsible Department

### Physical characteristics

* Material
* Diameter
* Installation Date
* Age
* Length
* Pressure Class
* Pipe Class
* Manufacturer
* Joint Type
* Lining Type
* Installation Method
* Depth
* Location

### Operational characteristics

* Normal Operating Pressure
* Criticality
* Service Area
* Number of Customers Served
* Customer Type
* Flow/Capacity where available
* Shutoff/Isolation information

### Location

Use PostGIS/geospatial support.

Store:

* Line geometry
* Beginning/end coordinates
* Service area
* Connected assets
* Nearby facilities
* Related valves
* Hydrants
* Pump stations where appropriate

The primary asset should be spatially represented as a line.

---

# 5. Waterline Network Model

Waterlines should not exist only as isolated segments.

Create relationships between assets.

Support concepts such as:

* Connected segments
* Junctions
* Valves
* Hydrants
* Meters
* Pump stations
* Storage facilities
* Pressure zones
* Service areas

The architecture should allow a waterline network to eventually support network-level analysis.

For the initial MVP, prioritize waterline segments but design the database so connected assets can be added.

---

# 6. Inspection Management

Create an inspection module allowing users to:

* Create inspections
* Select assets
* Record inspection date
* Record inspection type
* Record inspector
* Record observations
* Record defects
* Record measurements
* Upload photos/documents
* Record GPS/location information
* Record inspection confidence/quality
* Mark assets requiring follow-up

Create configurable inspection templates.

The goal is for administrators to eventually define inspection forms without changing application code.

Example waterline inspection information:

* Corrosion
* Leakage
* Structural damage
* Joint deterioration
* Coating condition
* External damage
* Internal condition
* Sediment/deposition
* Pressure issues
* Break history
* Ground movement
* Cathodic protection condition
* Other observed deficiencies

Do not assume every waterline has every inspection field.

The system should support configurable inspection fields.

---

# 7. Condition Management

Create a generalized condition framework.

A condition score should not be hard-coded as the only measure.

Support:

* Condition Index
* Condition Rating
* Individual condition components
* Inspection-based condition measures
* User-defined performance measures
* Confidence score

For waterlines, create an initial composite **Waterline Condition Index (WCI)**.

Use a 0–100 scale.

Example:

```text
85–100 = Excellent
70–84  = Good
50–69  = Fair
25–49  = Poor
0–24   = Very Poor
```

These thresholds should be configurable.

Do not treat these example thresholds as permanent business rules.

Make condition models configurable.

---

# 8. Waterline Failure and Defect Model

Create a framework for recording failure mechanisms.

Examples:

* Break
* Leak
* Corrosion
* Tuberculation
* Joint failure
* Structural deterioration
* External loading
* Ground movement
* Pressure-related failure
* Material-related failure

Allow assets to have historical failures.

Store:

* Failure date
* Failure type
* Severity
* Repair cost
* Downtime
* Customers affected
* Cause
* Location
* Restoration time
* Consequence

Failure history should become an input into risk and deterioration analysis.

---

# 9. Deterioration Modeling

This is a major part of the application.

Users must be able to create and manage deterioration models.

The system should support multiple modeling approaches rather than assuming one universal method.

Potential model types:

* Linear
* Polynomial
* Exponential
* Logistic
* Markov/state-transition
* User-defined empirical model
* Regression-based model

The initial implementation should support at minimum:

1. Curve-based deterioration
2. State-transition/Markov-style deterioration

Allow administrators to define:

* Independent variables
* Condition measure
* Initial condition
* Deterioration rate
* Model coefficients
* Calibration parameters
* Minimum/maximum limits
* Transition probabilities
* Model validity period
* Asset class applicability

Example:

```text
Waterline Material = Cast Iron
Diameter = 8"
Age = 50 years
Current WCI = 62

Forecast:
2026 = 62
2027 = 60
2028 = 58
2029 = 55
2030 = 52
2031 = 48
2032 = 44
```

The system should plot deterioration curves.

Allow users to compare:

* Current trajectory
* Treatment trajectory
* Funding-constrained trajectory
* Target condition trajectory

---

# 10. Deterioration Model Calibration

Create a model calibration concept.

Eventually the system should be able to compare predicted deterioration against observed inspection data.

Store:

* Predicted condition
* Observed condition
* Prediction error
* Model version
* Calibration date
* Calibration dataset

Create a foundation for eventually fitting models statistically.

Do not pretend that the initial MVP contains sophisticated machine learning.

Use transparent, explainable models first.

---

# 11. Risk-Based Analysis

Risk should be a core concept, not an afterthought.

Calculate asset risk using:

**Risk = Probability of Failure × Consequence of Failure**

Allow both components to be configurable.

### Probability of Failure

Potential inputs:

* Condition
* Age
* Material
* Diameter
* Failure history
* Deterioration rate
* Installation environment
* Inspection findings

### Consequence of Failure

Potential inputs:

* Customers affected
* Critical customers affected
* Road disruption
* Environmental impact
* Repair cost
* Service interruption
* Emergency response cost
* Redundancy
* Critical facilities affected
* Economic impact

Provide configurable scoring.

Example:

```text
Probability of Failure
1 = Very Low
2 = Low
3 = Moderate
4 = High
5 = Very High

Consequence
1 = Very Low
2 = Low
3 = Moderate
4 = High
5 = Very High

Risk Score = Probability × Consequence
```

Make the scoring framework configurable.

Display risk on maps and dashboards.

---

# 12. Criticality

Create a dedicated criticality concept.

A waterline serving a hospital or large population should potentially have higher consequence than a low-impact line.

Allow criticality to incorporate:

* Customers served
* Critical facilities
* Pressure zone importance
* Redundancy
* Network connectivity
* Emergency response difficulty
* Service area importance

Criticality should be usable independently and also as an input into risk.

---

# 13. Treatments

Create a generic treatment framework.

A treatment represents an action intended to maintain, improve, rehabilitate, or replace an asset.

Initial waterline treatment examples:

* Inspection
* Leak repair
* Spot repair
* Valve replacement
* Lining
* Coating
* Cathodic protection
* Rehabilitation
* Relining
* Replacement
* Upsizing
* Abandonment
* Emergency repair

Each treatment should have configurable:

* Treatment name
* Description
* Applicable asset types
* Applicable condition range
* Applicable material
* Applicable diameter
* Expected life extension
* Cost
* Unit
* Mobilization cost
* Annual maintenance cost
* Effect on condition
* Effect on failure probability
* Effect on risk
* Expected useful life
* Implementation constraints

---

# 14. Life Cycle Cost Analysis

Life cycle cost should be integrated into decision-making.

Do not simply compare today's treatment cost.

Calculate total expected cost over a user-defined analysis period.

Potential components:

* Initial treatment cost
* Maintenance cost
* Inspection cost
* Renewal cost
* Replacement cost
* Failure cost
* Emergency repair cost
* User/consequence cost
* Residual value where applicable

Support:

* Discount rate
* Inflation assumptions
* Analysis period
* Treatment timing
* Expected service life

Display:

* Initial cost
* Present value
* Annualized cost
* Net present value
* Total life-cycle cost

---

# 15. Scenario Planning

Create a scenario engine.

Users should be able to create scenarios such as:

* Current funding
* Increased funding
* Reduced funding
* Risk-based strategy
* Condition-based strategy
* Replacement-only strategy
* Preventive strategy

Each scenario should allow users to change assumptions such as:

* Available annual budget
* Funding growth
* Discount rate
* Condition targets
* Risk threshold
* Treatment costs
* Analysis period

Run the scenario and produce:

* Recommended work
* Annual spending
* Condition forecast
* Risk forecast
* Backlog
* Number of failures
* Life-cycle cost
* Network performance

---

# 16. Optimization

The goal is not simply to find assets in poor condition.

The system should determine the **best use of limited funds**.

Create an optimization framework that can prioritize projects based on configurable objectives.

Possible objectives:

* Minimize life-cycle cost
* Maximize condition
* Minimize risk
* Maximize risk reduction per dollar
* Maintain target condition
* Maintain maximum allowable risk
* Minimize expected failure cost
* Multi-objective optimization

The system should eventually support weighted objectives.

Example:

```text
Condition Improvement       30%
Risk Reduction              40%
Life Cycle Cost             20%
Criticality                 10%
```

Allow the user to change weights.

The system should calculate a priority score or optimization result.

For the initial implementation, a transparent scoring/optimization algorithm is acceptable.

Do not invent a black-box AI algorithm.

---

# 17. Work Plan

Create a multi-year work plan.

Display:

* Year
* Asset
* Location
* Recommended Treatment
* Reason
* Risk
* Condition
* Estimated Cost
* Expected Benefit
* Funding Source
* Status

Allow users to move treatments between years.

Automatically recalculate impacts.

Example:

```text
2027
Waterline WL-001
Replacement
$1.2M
Risk reduction: High

2028
Waterline WL-037
Rehabilitation
$450K
Risk reduction: Medium
```

---

# 18. Executive Dashboard

Create a dashboard inspired by the attached screenshot, but make it a **Waterline Executive Dashboard**.

Use the same overall visual philosophy:

* Dark navy sidebar
* Clean white/light-gray workspace
* Large KPI cards
* Maps
* Charts
* Work-plan table
* Blue primary accent
* Professional infrastructure-management aesthetic

Do not copy the pavement terminology.

Potential top-level KPIs:

### Network Condition

Example:

**72.4**
Waterline Condition Index

### Network Length

Example:

**1,284 mi**
Waterline Network

### Identified Needs

Example:

**$42.8M**
10-Year Need

### Annual Budget

Example:

**$18.5M**
Available / Year

Other useful KPIs:

* High Risk Assets
* Assets Past Expected Life
* Failures This Year
* Customers at Risk
* Deferred Backlog
* Expected Annual Failure Cost

---

# 19. Executive Dashboard Map

Create a large interactive map.

Show waterline segments spatially.

Color assets by:

* Condition
* Risk
* Treatment recommendation
* Age

Allow the user to switch the map visualization.

Example condition colors:

```text
Excellent
Good
Fair
Poor
Very Poor
```

Clicking an asset should open a summary panel containing:

* Asset ID
* Condition
* Risk
* Age
* Material
* Diameter
* Failure history
* Recommended treatment
* Estimated cost

---

# 20. Executive Dashboard Charts

Include charts such as:

### Condition Forecast

Show:

* Current condition
* Forecast condition
* Target condition

### Risk Forecast

Show:

* Current risk
* Forecast risk
* Risk target

### Budget vs Backlog

Show:

* Annual budget
* Annual recommended spending
* Deferred backlog

### Condition Distribution

Example:

```text
Excellent   22%
Good        31%
Fair        27%
Poor        15%
Very Poor    5%
```

### Treatment Mix

Show spending by treatment type.

---

# 21. Navigation

Create a sidebar similar to the screenshot.

Initial navigation:

```text
CARNAC

Dashboard
Network
Assets
Inspections
Condition
Risk
Deterioration Models
Treatment Planning
Scenario Planning
Work Plan
Reports
Administration
```

Potentially group related items visually.

---

# 22. Asset Detail Screen

Build a detailed asset page.

Example:

**Waterline WL-001**

Header:

```text
WL-001
8" Cast Iron Waterline
Kapolei Service Area
```

Display:

* Condition
* Risk
* Criticality
* Age
* Remaining Life
* Length
* Material
* Diameter

Tabs:

```text
Overview
Inspection History
Condition
Failures
Deterioration
Risk
Treatments
Costs
Documents
Map
```

Include charts for:

* Condition history
* Predicted deterioration
* Risk history
* Failure history

---

# 23. Network Screen

Create a network-level map and asset browser.

Support filters:

* Condition
* Risk
* Material
* Diameter
* Age
* Installation year
* Criticality
* Service area
* Treatment recommendation
* Inspection status

Allow multiple filters simultaneously.

---

# 24. Inspection Screen

Provide:

* Inspection list
* Search
* Filters
* Create Inspection
* Inspection detail
* Inspection form
* Photo/document attachments

Eventually support mobile-friendly inspection collection.

Design the forms so they can eventually work well on tablets/phones.

---

# 25. Administration

Create configuration screens for:

* Asset Types
* Asset Attributes
* Inspection Templates
* Condition Models
* Deterioration Models
* Risk Models
* Treatments
* Cost Libraries
* Criticality Rules
* Scenario Settings
* Users
* Roles
* Organizations
* Reference Data

---

# 26. Database Design

Design a normalized PostgreSQL schema.

At a conceptual level, include tables/entities such as:

```text
organizations
users
roles
permissions

asset_types
asset_attributes
assets
asset_relationships
asset_locations

inspections
inspection_templates
inspection_results
inspection_attachments

conditions
condition_measurements
condition_models

failure_events
failure_types

deterioration_models
deterioration_parameters
deterioration_predictions

risk_models
risk_assessments
risk_factors
criticality_scores

treatments
treatment_rules
treatment_costs
treatment_effects

scenarios
scenario_assumptions
scenario_results

work_plans
work_plan_items

projects
budgets
costs

documents
```

Use foreign keys and proper relationships.

Add audit fields where appropriate:

* created_at
* created_by
* updated_at
* updated_by

Consider soft deletion where appropriate.

---

# 27. Data Import

Create an initial data-import capability.

At minimum support CSV upload.

Potential fields:

```text
Asset ID
Material
Diameter
Installation Year
Length
Latitude
Longitude
Condition
Criticality
Failure Count
Service Area
```

Support validation and error reporting before committing records.

Eventually this should support GIS formats such as GeoJSON.

---

# 28. Seed Data

Populate the application with realistic fictional waterline data.

Create enough data to make the application feel real.

For example:

* 150–500 waterline segments
* Multiple materials
* Multiple diameters
* Different installation years
* Different condition levels
* Failure history
* Different criticality
* Spatial distribution
* Several pressure/service areas

Use a fictional municipality rather than real infrastructure data.

Create realistic relationships between assets and inspections.

---

# 29. Demo Scenario

The seeded application should immediately demonstrate the complete workflow.

For example:

1. Waterline assets exist in the network.
2. Inspections have been performed.
3. Condition has been calculated.
4. Failures have been recorded.
5. Risk has been calculated.
6. Deterioration models forecast future condition.
7. Treatments have been evaluated.
8. Life-cycle costs have been calculated.
9. A budget scenario has been created.
10. The optimization engine recommends projects.
11. A 5-year work plan has been generated.
12. The executive dashboard summarizes the results.

The application should feel like a working asset-management system rather than a collection of static screens.

---

# 30. UX Requirements

The application must feel like professional enterprise infrastructure software.

Prioritize:

* Clean layout
* Excellent spacing
* Consistent typography
* Strong visual hierarchy
* Fast navigation
* Responsive design
* Clear data tables
* Interactive charts
* Interactive maps
* Useful empty states
* Useful validation/error messages
* Confirmation for destructive actions

Avoid:

* Excessive gradients
* Generic startup dashboards
* Excessive animations
* Decorative UI that doesn't communicate information
* Huge amounts of whitespace that reduce information density
* Fake functionality

Every major button should actually work.

---

# 31. Data Visualization Philosophy

Charts should communicate decisions, not simply display data.

For example, instead of only showing:

**Condition = 62**

show:

```text
Current Condition       62
Forecast 5 Years        51
Target Condition        70
Projected Deficiency    -19
```

Similarly, for risk:

```text
Current Risk            High
Projected Risk          Very High
Recommended Action      Replace
Expected Risk Reduction 65%
```

The interface should help decision-makers understand **what should be done and why**.

---

# 32. Explainability

Recommendations must be explainable.

When the system recommends a treatment, show something like:

```text
Recommended: Replace

Why?
• Condition is Poor
• High criticality
• Increasing failure probability
• 3 recorded failures in 5 years
• Replacement is lower life-cycle cost than continued repair
• Risk reduction is 68%
• Estimated cost: $1.4M
```

Never present an unexplained recommendation.

---

# 33. Reporting

Create report functionality for:

* Asset inventory
* Condition
* Risk
* Inspection history
* Failure history
* Deterioration forecast
* Treatment needs
* Capital needs
* Work plans
* Scenario comparison
* Life-cycle cost

Support export to CSV initially.

Design the architecture so PDF/Excel reporting can be added later.

---

# 34. Permissions

Implement basic role-based access.

At minimum:

### Administrator

Full access.

### Asset Manager

Can manage assets, inspections, models, treatments, scenarios, and work plans.

### Inspector

Can collect and modify inspection information.

### Executive

Read-only access to dashboards, reports, scenarios, and work plans.

---

# 35. Important Architectural Requirements

Do NOT hard-code business logic into React components.

Separate:

```text
UI
↓
API / Application Layer
↓
Domain Logic
↓
Database
```

Deterioration calculations, risk calculations, life-cycle cost calculations, and optimization should live in reusable business-logic modules.

The objective is for a future developer to be able to add another asset type without rewriting the core platform.

For example, a future asset type should conceptually be:

```text
Asset Type → Waterline
Asset Type → [Future Asset Type]
Asset Type → [Future Asset Type]
```

without changing the fundamental asset/inspection/risk/treatment architecture.

---

# 36. What NOT to Build

Do not implement:

* Pavement management
* Bridges
* Roads
* Highways
* Traffic assets
* Transportation asset terminology
* Pavement condition indices
* Bridge condition ratings
* Transportation-specific deterioration models

Do not simply rename pavement fields.

Waterline management needs to be represented as its own domain.

However, the underlying platform architecture should remain generic.

---

# 37. Initial Development Strategy

Do not attempt to build every advanced capability simultaneously.

Build a functional MVP in stages.

### Phase 1 — Platform Foundation

Build:

* Application shell
* Authentication
* Navigation
* PostgreSQL database
* Generic asset model
* Waterline asset type
* Asset inventory
* GIS/map
* Asset detail screen
* Seed data

### Phase 2 — Inspection & Condition

Build:

* Inspection templates
* Inspection forms
* Inspection history
* Defects
* Condition measurements
* Waterline Condition Index

### Phase 3 — Risk

Build:

* Criticality
* Probability of failure
* Consequence
* Risk calculation
* Risk maps
* Risk dashboards

### Phase 4 — Deterioration

Build:

* Deterioration models
* Model configuration
* Forecasting
* Condition forecast charts
* Model comparison

### Phase 5 — Treatment Planning

Build:

* Treatment library
* Treatment applicability
* Treatment effects
* Treatment cost
* Recommendations

### Phase 6 — Life Cycle Cost & Scenarios

Build:

* LCCA
* Funding scenarios
* Budget constraints
* Alternative strategies

### Phase 7 — Optimization & Work Plan

Build:

* Priority/optimization algorithm
* Multi-year work plan
* Budget allocation
* Condition/risk forecast
* Backlog

### Phase 8 — Reporting & Administration

Build:

* Reports
* Configuration
* User management
* Data import/export
* Audit functionality

---

# 38. Development Behavior

Work like a senior software architect and product engineer.

Before implementing complex functionality, establish:

1. Database schema
2. Domain model
3. API structure
4. Core business logic
5. UI structure

Do not create superficial mock screens with fake buttons.

When something is represented as a metric or chart, calculate it from database data.

When a user changes a scenario assumption, the resulting calculations should actually change.

When an asset is added or edited, the dashboard should reflect the updated information.

When a treatment is assigned, risk/cost/condition calculations should be capable of reflecting that treatment.

---

# 39. Visual Direction

Use the attached screenshot as the primary visual inspiration for the application shell.

The screenshot contains:

* Dark left navigation
* Large dashboard workspace
* KPI cards across the top
* Large network map
* Forecast chart
* Budget/backlog chart
* Multi-year work plan
* Clean blue accent color
* Professional infrastructure-management aesthetic

Adapt this to CARNAC.

The application should feel like a **modern enterprise infrastructure asset-management platform**, not a generic SaaS template.

Suggested branding:

**CARNAC**

Use a simple professional logo treatment.

The name should appear consistently throughout the application.

---

# 40. First Deliverable

Start by building the working application for the following user journey:

```text
Login
   ↓
Executive Dashboard
   ↓
Network Map
   ↓
Select Waterline
   ↓
Asset Detail
   ↓
Inspection History
   ↓
Condition
   ↓
Deterioration Forecast
   ↓
Risk Assessment
   ↓
Treatment Alternatives
   ↓
Life Cycle Cost
   ↓
Recommended Treatment
   ↓
Scenario Planning
   ↓
5-Year Work Plan
```

This workflow is more important than implementing dozens of disconnected features.

The final result should demonstrate the fundamental CARNAC philosophy:

**Collect → Understand → Predict → Assess Risk → Evaluate Alternatives → Optimize → Plan → Report**

Build the system so that this entire workflow is driven by real data stored in PostgreSQL.

Do not use hard-coded dashboard numbers except where clearly identified as seed/demo data.

---

# 41. Success Criteria

The first working version is successful when I can:

1. Log into CARNAC.
2. View a waterline network on a map.
3. Search and filter waterline assets.
4. Open an asset and see its inventory information.
5. View inspections and failures.
6. See its condition history.
7. See a predicted deterioration curve.
8. See probability of failure and consequence/risk.
9. Compare potential treatments.
10. See life-cycle cost implications.
11. Create a funding scenario.
12. Generate recommended projects.
13. Produce a multi-year work plan.
14. See the resulting condition/risk/budget impacts on the executive dashboard.
15. Add/edit data in the database and see the results reflected throughout the application.

The architecture should make it clear that **waterlines are the first implementation of CARNAC, not the definition of CARNAC itself**.

Build the foundation correctly now so that additional asset classes can be added later without fundamentally redesigning the platform.
