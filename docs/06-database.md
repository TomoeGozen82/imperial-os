# IMPERIAL OS — V1 Database Design

> **Related:** [00 — Product Overview](./00-product-overview.md) · [01 — V1 Scope](./01-v1-scope.md) · [02 — User Journeys](./02-user-journeys.md) · [03 — Architecture](./03-architecture.md) · [04 — Domain Model](./04-domain-model.md)
>
> This is the **physical PostgreSQL design** for V1. It is the basis for the Prisma schema and first migrations, which are **not** created here.
>
> - It follows the domain model (`04`) and architecture (`03`). It introduces **no business requirements**.
> - Open business decisions are referenced as `OD-xx` from [01 — V1 Scope, Section 16](./01-v1-scope.md#16-open-business-decisions). None are resolved here.
> - Areas that depend on an open decision are marked **⚠ Provisional**.
> - Technical choices made here are labelled **DB-xx** (database design decisions). They are not business requirements.

> **Note on `OD-31` and `OD-32`.** Both are open business decisions in the central list. The schema keeps every area that depends on them provisional:
>
> - **`OD-31`:** whether a Close / Agreement funnel count, a door outcome and a Sale can represent the same customer event, including whether these records should be linked, derived from one another, or independently recorded.
> - **`OD-32`:** what "status" means for Junior Associate versus Associate, including whether it represents progression within a role, a separate lifecycle/employment state, or another business concept.

---

## Contents

1. [Database Principles](#1-database-principles)
2. [Naming Conventions](#2-naming-conventions)
3. [Organisation and Identity Tables](#3-organisation-and-identity-tables)
4. [Deployment Domain](#4-deployment-domain)
5. [Field Execution Tables](#5-field-execution-tables)
6. [Door Outcomes](#6-door-outcomes)
7. [Funnel / KPI Model](#7-funnel--kpi-model)
8. [Sales and Sale Status](#8-sales-and-sale-status)
9. [Commercial Configuration](#9-commercial-configuration)
10. [Performance](#10-performance)
11. [Learning](#11-learning)
12. [Readiness](#12-readiness)
13. [Business Rules](#13-business-rules)
14. [Offline Synchronization](#14-offline-synchronization)
15. [Audit / History](#15-audit--history)
16. [Relationships and Foreign Keys](#16-relationships-and-foreign-keys)
17. [Index Strategy](#17-index-strategy)
18. [Constraints and Invariants](#18-constraints-and-invariants)
19. [Open-Decision Impact](#19-open-decision-impact)
20. [Proposed Table Inventory](#20-proposed-table-inventory)
21. [Prisma Mapping Considerations](#21-prisma-mapping-considerations)
22. [Migration Strategy](#22-migration-strategy)
23. [Database Summary](#23-database-summary)

---

## 1. Database Principles

| Principle                              | Application                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL is the system of record     | All business data lives in PostgreSQL. Clients never write to it directly (03 §8).                                                 |
| Prisma is the ORM                      | The backend reads/writes through Prisma. Features Prisma cannot express are added as raw SQL inside Prisma migrations (Section 21). |
| Migration-driven, version-controlled   | Every schema change is a committed Prisma migration. No manual schema changes in shared environments (03 §9).                     |
| Foreign keys protect real ownership    | Every real relationship has a foreign key. Deletion of referenced rows is restricted by default.                                    |
| No duplicated sources of truth         | Derivable values are derived (e.g. current sale status, readiness state, `effective_to`). Deliberate exceptions are listed (`DB-04`). |
| History for business-critical changes  | Sale status changes, commercial configuration versions, readiness decisions and sync receipts are append-only records.             |
| Reproducible financial calculations    | Financial values reference the configuration version used (`AD-21`). Configuration versions are immutable (`AD-20`).               |
| Idempotent sync                        | Field records use the client-generated ID as primary key; sync receipts are unique per client operation ID (`AD-19`).              |
| No business logic in triggers          | No triggers for business rules. The only acceptable trigger use is purely technical (e.g. none planned for V1).                    |
| No premature optimization              | Indexes, partitioning and caching tables are added only for identified access paths (Section 17).                                   |

---

## 2. Naming Conventions

| Item                  | Convention                                                                                                       | Example                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Tables                | `snake_case`, plural.                                                                                             | `door_activities`, `sale_status_history` (history tables keep the singular `history`) |
| Primary keys          | `id`, type `uuid`.                                                                                                | `id uuid`                                 |
| Server-generated IDs  | `gen_random_uuid()` default.                                                                                      | `campaigns.id`                            |
| Client-generated IDs  | No default; supplied by the mobile client (`AD-19`).                                                              | `door_activities.id`                      |
| Foreign keys          | `<referenced_entity>_id`. Role-qualified where needed.                                                            | `campaign_id`, `recorded_by_user_id`      |
| Timestamps            | `timestamptz`. Every table has `created_at` (default `now()`). `updated_at` is present on every row that can be updated, including rows whose only permitted update is ending (`ends_at`) or archiving (`archived_at`). Append-only tables have no `updated_at` and are labelled **append-only**. Event times named `<event>_at`. | `submitted_at`, `decided_at`              |
| Dates                 | `date` only where the concept is a calendar day.                                                                  | `eod_records.report_date`                 |
| Actors                | `<verb>_by_user_id`.                                                                                              | `created_by_user_id`, `decided_by_user_id`|
| Fixed system values   | PostgreSQL enum, `UPPER_SNAKE` values.                                                                            | `funnel_stage = 'PROBLEM_AWARENESS'`      |
| Evolvable values      | Lookup/configuration table referenced by FK, with a stable `key`.                                                 | `door_outcomes`, `sale_statuses`          |
| History tables        | Append-only; no `updated_at`; `<entity>_history` or a domain name for the event.                                 | `sale_status_history`, `readiness_decisions` |
| Unique constraints    | `uq_<table>__<columns>`                                                                                           | `uq_sync_receipts__client_operation_id`   |
| Indexes               | `ix_<table>__<columns>`                                                                                           | `ix_sales__deployment_id__agreed_at`      |
| Foreign key names     | `fk_<table>__<column>`                                                                                            | `fk_sales__deployment_id`                 |
| Check constraints     | `ck_<table>__<rule>`                                                                                              | `ck_assignments__exactly_one_item`        |
| Money                 | `numeric(12,2)` amount + `char(3)` currency code (`DB-03`).                                                       | `sale_value_amount`, `currency_code`      |
| Nullable fields       | `NULL` only when the domain allows absence or the value is pending an open decision (marked ⚠).                 |                                           |
| Soft deletion         | **Not** used by default. Configuration that may be referenced by history uses `archived_at` (hidden from new use, never deleted). Operational and history records are not soft-deleted. | `campaigns.archived_at` |

### Database Design Decisions

| ID    | Decision                                                                                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB-01 | UUID primary keys everywhere. Field records use the client-generated UUID as their primary key, which makes record creation naturally idempotent.                                                                          |
| DB-02 | Evolvable business vocabularies (roles, perspectives, deployment states, door outcomes, sale statuses) are lookup tables, not enums, so values can be added without a schema migration. Fixed system vocabularies are enums. |
| DB-03 | Money is stored as `numeric(12,2)` with an explicit ISO currency code. No currency is assumed.                                                                                                                              |
| DB-04 | `organization_id` is stored on top-level, scope-sensitive rows (`AD-15`) as an immutable tenant key, even where derivable through a parent. This includes per-Associate records such as Field records, assignments, quiz attempts, submissions and readiness submissions. Child rows (modules, lessons, progress, evidence, history entries, feedback, financial values) inherit scope through their parent. This is the only deliberate denormalisation. `organization_id` is **authoritative tenant context**: the backend assigns it from trusted context (the parent record, or the authenticated user's organisational assignment). Clients never choose it, and any `organization_id` in a client payload is ignored or rejected. |
| DB-05 | Effective-dated rows store `effective_from` only. The end of a version is derived from the next version, so there is no second source of truth for `effective_to`. `effective_from` cannot be earlier than `created_at` (check constraint on `commercial_configuration_versions`, `day_rates` and `kpi_targets`). Derived results (financial values, profitability, KPI results against targets) are calculated from the configuration effective at the relevant time, so a back-dated version would silently change historical results. This protects the historical accuracy rule (01 §10); it adds no other versioning rule. |
| DB-06 | PostgreSQL 15+ is assumed for `UNIQUE NULLS NOT DISTINCT`. This must be confirmed for each environment (`AQ-04`).                                                                                                          |

---

## 3. Organisation and Identity Tables

Module: **Identity** (organisation, users, assignments, roles) and **Access** (perspectives, scopes, permissions, grants).

### `organizations`

| Column       | Type         | Null | Notes            |
| ------------ | ------------ | ---- | ---------------- |
| `id`         | uuid         | no   | PK               |
| `name`       | text         | no   |                  |
| `created_at` | timestamptz  | no   |                  |
| `updated_at` | timestamptz  | no   |                  |

### `users`

One row per identity, regardless of role (00 §5).

| Column              | Type        | Null | Notes                                                                 |
| ------------------- | ----------- | ---- | --------------------------------------------------------------------- |
| `id`                | uuid        | no   | PK                                                                    |
| `auth_subject`      | text        | yes  | ⚠ Identifier from the authentication provider (`AQ-01`, `OD-04`). Unique when present. |
| `email`             | citext      | yes  | ⚠ Unique when present. Whether required depends on `OD-04`.          |
| `display_name`      | text        | no   |                                                                       |
| `created_at`        | timestamptz | no   |                                                                       |
| `updated_at`        | timestamptz | no   |                                                                       |

There is **no** user status column. The meaning of Junior Associate vs Associate "status" is undecided (`OD-32`).

### `organizational_assignments`

The single representation of organisation membership (04 §3.1).

| Column               | Type        | Null | Notes                               |
| -------------------- | ----------- | ---- | ----------------------------------- |
| `id`                 | uuid        | no   | PK                                  |
| `user_id`            | uuid        | no   | FK `users`                          |
| `organization_id`    | uuid        | no   | FK `organizations`                  |
| `starts_at`          | timestamptz | no   |                                     |
| `ends_at`            | timestamptz | yes  | `NULL` = current                    |
| `created_by_user_id` | uuid        | yes  | FK `users`; `NULL` for bootstrap data |
| `created_at`         | timestamptz | no   |                                     |
| `updated_at`         | timestamptz | no   | Ending (setting `ends_at`) is the only permitted update. |

### `roles`

Lookup table (`DB-02`). Seeded with `JUNIOR_ASSOCIATE`, `ASSOCIATE`, `MANAGING_DIRECTOR`. There is **no** `ADMIN` row. Future roles are added as rows. Seed rows are not updated, so there is no `updated_at`.

| Column       | Type        | Null | Notes                     |
| ------------ | ----------- | ---- | ------------------------- |
| `id`         | uuid        | no   | PK                        |
| `key`        | text        | no   | Unique, stable code       |
| `name`       | text        | no   |                           |
| `created_at` | timestamptz | no   |                           |

### `role_assignments`

Role history: progression (`OD-26`) closes one row and opens another.

| Column                | Type        | Null | Notes                    |
| --------------------- | ----------- | ---- | ------------------------ |
| `id`                  | uuid        | no   | PK                       |
| `user_id`             | uuid        | no   | FK `users`               |
| `organization_id`     | uuid        | no   | FK `organizations`       |
| `role_id`             | uuid        | no   | FK `roles`               |
| `starts_at`           | timestamptz | no   |                          |
| `ends_at`             | timestamptz | yes  | `NULL` = current         |
| `assigned_by_user_id` | uuid        | yes  | FK `users`               |
| `created_at`          | timestamptz | no   |                          |
| `updated_at`          | timestamptz | no   | Ending (setting `ends_at`) is the only permitted update. |

⚠ Whether a user may hold more than one current role is not specified. The database prevents only a duplicate **current** assignment of the **same** role; "one current role per user" is enforced in NestJS for V1 and can be relaxed without a migration.

### `perspectives` and `role_perspectives`

| Table               | Columns                                              | Notes                                                                 |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `perspectives`      | `id`, `key` (unique), `name`, `created_at`           | Seeded: `ASSOCIATE` (mobile), `MANAGING_DIRECTOR` (web / Admin). Seed rows are not updated. |
| `role_perspectives` | `role_id` FK, `perspective_id` FK, `created_at`; PK (`role_id`, `perspective_id`) | Which perspectives a role operates in. Seeded; rows are not updated. |

`DB-07`: perspectives are attached to roles, not stored per user (`AD-24`). A user's perspectives are those of their current role assignment(s). This keeps Perspective separate from Role while avoiding per-user configuration V1 does not need.

### `scopes`

| Column            | Type        | Null | Notes                                                                    |
| ----------------- | ----------- | ---- | ------------------------------------------------------------------------ |
| `id`              | uuid        | no   | PK                                                                       |
| `organization_id` | uuid        | no   | FK `organizations`                                                       |
| `scope_type`      | enum `scope_type` | no | V1 value: `ORGANIZATION`. Future values (region, area, campaign, territory) are added to the enum (`AD-15`). |
| `target_id`       | uuid        | yes  | Entity bounded by the scope. `NULL` for `ORGANIZATION` scope.           |
| `created_at`      | timestamptz | no   |                                                                          |

Scope rows are not updated, so there is no `updated_at`. No hierarchy columns (no parent scope). Associates' own-record restriction (`AD-16`) is enforced in NestJS, not as a scope row.

### `permissions` and `permission_grants`

| Table               | Columns                                                                                                   | Notes |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ----- |
| `permissions`       | `id`, `key` (unique, e.g. `readiness.approve`), `action` enum `permission_action` (`VIEW`, `ACT`, `APPROVE`), `resource` text, `created_at` | Seeded by migration with the V1 permission set (organisation-independent). Seed rows are not updated. |
| `permission_grants` | `id`, `role_id` FK, `permission_id` FK, `scope_id` FK, `created_by_user_id` FK nullable, `created_at`     | Grants a permission to a role within a scope; the organisation comes from the scope. Unique (`role_id`, `permission_id`, `scope_id`). Rows are not updated in place, so there is no `updated_at`. |

Examples of V1 grants (from existing requirements, not new ones): `readiness.approve` and `sale_status.update` are granted only to `MANAGING_DIRECTOR`.

`DB-08`: grants are made to roles, not individual users, in V1 (`AD-24`). A user's effective access is the set of grants on their current role assignment(s), within the grant's scope. There is no per-user permission customisation in V1.

Grants cannot be seeded by migrations: each grant needs a scope, and a scope needs an organisation, which does not exist when migrations run. Default grants are created by the environment bootstrap (Section 22).

---

## 4. Deployment Domain

Module: **Deployment** (`AD-06`).

### `campaigns`

| Column             | Type        | Null | Notes                                                                       |
| ------------------ | ----------- | ---- | --------------------------------------------------------------------------- |
| `id`               | uuid        | no   | PK                                                                          |
| `organization_id`  | uuid        | no   | FK `organizations`                                                          |
| `name`             | text        | no   | Unique per organisation                                                     |
| `client_reference` | text        | yes  | ⚠ `OD-30`. Free-text client label. **Not** a foreign key; no Client table. |
| `archived_at`      | timestamptz | yes  |                                                                             |
| `created_at`, `updated_at` | timestamptz | no |                                                                       |

### `territories`

| Column            | Type        | Null | Notes                                      |
| ----------------- | ----------- | ---- | ------------------------------------------ |
| `id`              | uuid        | no   | PK                                         |
| `organization_id` | uuid        | no   | FK `organizations`                         |
| `name`            | text        | no   | Unique per organisation                    |
| `archived_at`     | timestamptz | yes  |                                            |
| `created_at`, `updated_at` | timestamptz | no |                                      |

⚠ `OD-11`: Territory has **no** `campaign_id`. Campaign and Territory are related only through Deployment. If `OD-11` establishes a direct relationship, a nullable `campaign_id` column or a `campaign_territories` join table is an additive migration.

### `deployment_states`

Lookup table (`DB-02`). Seeded with `ACTIVE` only — the only state established (01 §3). Further states are added when `OD-11` is resolved.

| Column | Type | Null | Notes |
| ------ | ---- | ---- | ----- |
| `id`         | uuid        | no   | PK     |
| `key`        | text        | no   | Unique |
| `name`       | text        | no   |        |
| `created_at` | timestamptz | no   |        |

Seed rows are not updated, so there is no `updated_at`.

### `deployments`

| Column                 | Type        | Null | Notes                                       |
| ---------------------- | ----------- | ---- | ------------------------------------------- |
| `id`                   | uuid        | no   | PK                                          |
| `organization_id`      | uuid        | no   | FK `organizations`                          |
| `associate_user_id`    | uuid        | no   | FK `users`                                  |
| `campaign_id`          | uuid        | no   | FK `campaigns`                              |
| `territory_id`         | uuid        | no   | FK `territories`                            |
| `deployment_state_id`  | uuid        | no   | FK `deployment_states`. **Authoritative lifecycle indicator.** |
| `starts_at`            | timestamptz | no   |                                             |
| `created_by_user_id`   | uuid        | no   | FK `users` (Managing Director)              |
| `updated_by_user_id`   | uuid        | yes  | FK `users`                                  |
| `created_at`, `updated_at` | timestamptz | no |                                           |

- The deployment's lifecycle is represented **only** by `deployment_state_id`. There is no `ends_at` column, so there is no second lifecycle mechanism. ⚠ States beyond `ACTIVE`, and how a deployment ends, are `OD-11`; they are added as `deployment_states` rows (and, if needed, columns) when decided.
- Whether a deployment's campaign or territory can be changed after creation is not specified by the source documents; no immutability is encoded.
- **No** uniqueness on "one active deployment per Associate" (`OD-11`).
- Eligibility (Associate is Field Ready) is checked in NestJS at creation.

---

## 5. Field Execution Tables

Module: **Field**. These are **separate** operational records. None is derived from another, none is created automatically from another, and sales, door activities and funnel Close / Agreement inputs are not linked to one another as the same event (`OD-31`, unresolved).

### Common Columns for Synced Field Records

Applies to `door_activities`, `funnel_kpi_inputs`, `sales`, `callbacks`, `notes`, `eod_records`.

| Column                 | Type        | Null | Notes                                                                                |
| ---------------------- | ----------- | ---- | ------------------------------------------------------------------------------------ |
| `id`                   | uuid        | no   | PK. **Client-generated** (`AD-19`, `DB-01`).                                         |
| `organization_id`      | uuid        | no   | FK `organizations` (`DB-04`). Assigned by the backend from the deployment / authenticated user; never taken from the sync payload. |
| `deployment_id`        | uuid        | no*  | FK `deployments`. *Nullable only on `eod_records` (see below).                      |
| `recorded_by_user_id`  | uuid        | no   | FK `users`. The Associate who recorded it. Must be the deployment's Associate in V1 (NestJS, `AD-16`). |
| `recorded_at`          | timestamptz | no   | Device time of recording.                                                            |
| `accepted_at`          | timestamptz | no   | Server time of acceptance. A row exists only after acceptance.                      |
| `created_at`, `updated_at` | timestamptz | no |                                                                                    |

There is **no** sync-state column on Field records. Device sync states are client-side only (Section 14).

### `door_activities`

| Column            | Type | Null | Notes                                                           |
| ----------------- | ---- | ---- | --------------------------------------------------------------- |
| *common columns*  |      |      |                                                                 |
| `door_outcome_id` | uuid | no   | FK `door_outcomes` (Section 6)                                  |
| `door_label`      | text | yes  | ⚠ How a door is identified is not specified. Optional free text. |

### `funnel_kpi_inputs`

See Section 7.

### `sales`

See Section 8.

### `callbacks`

| Column              | Type | Null | Notes                                                                          |
| ------------------- | ---- | ---- | ------------------------------------------------------------------------------ |
| *common columns*    |      |      |                                                                                |
| `details`           | text | yes  | ⚠ Callback content and any due date are `OD-01`; columns are added when decided. |

No link to a door activity: the documents establish only Deployment → Callback (04 §3.6), and how callbacks are triggered is `OD-01`.

### `notes`

| Column              | Type | Null | Notes                                                    |
| ------------------- | ---- | ---- | -------------------------------------------------------- |
| *common columns*    |      |      |                                                          |
| `body`              | text | no   |                                                          |
| `door_activity_id`  | uuid | yes  | FK. Optional subject.                                    |
| `sale_id`           | uuid | yes  | FK. Optional subject.                                    |
| `callback_id`       | uuid | yes  | FK. Optional subject.                                    |

Check: at most one of the optional subject FKs is set. A note with none is attached to the deployment only.

### `eod_records`

| Column           | Type        | Null | Notes                                                                            |
| ---------------- | ----------- | ---- | -------------------------------------------------------------------------------- |
| *common columns* |             |      | `deployment_id` is **nullable** here (04 §3.6: "Associate / Deployment").        |
| `report_date`    | date        | no   |                                                                                  |
| `content`        | jsonb       | yes  | ⚠ `OD-22`. EOD content is undefined; JSON is used provisionally (Section 21).   |
| `processed_at`   | timestamptz | yes  | Final server-side processing time (01 §8). ⚠ What processing does: `OD-22`.     |

- A draft EOD exists on the device; the server row is created on sync. Whether the server also stores drafts before final submission is part of `OD-22`.
- No uniqueness on (`recorded_by_user_id`, `report_date`) until `OD-02`/`OD-22` define it.

### Optional Cross-Record Links

| Link                            | Purpose                                         | Required? | Source |
| ------------------------------- | ----------------------------------------------- | --------- | ------ |
| `funnel_kpi_inputs.door_activity_id` | Per-door funnel/KPI input                  | No        | `OD-13` requires per-door recording to remain possible. |
| `notes.door_activity_id` / `sale_id` / `callback_id` | Note about a specific Field record | No | 04 §3.6: "Deployment / Field record → Note". |

There is **no** link from `sales` or `callbacks` to `door_activities`. The documents do not establish those relationships, and whether a sale, a door outcome and a Close / Agreement count are linked is `OD-31`. A nullable column can be added later as an additive migration if a decision requires it.

---

## 6. Door Outcomes

⚠ `OD-12`: the outcome set and its configurability are undecided.

### `door_outcomes`

| Column            | Type        | Null | Notes                                                                       |
| ----------------- | ----------- | ---- | --------------------------------------------------------------------------- |
| `id`              | uuid        | no   | PK                                                                          |
| `organization_id` | uuid        | no   | FK `organizations`                                                          |
| `campaign_id`     | uuid        | yes  | FK `campaigns`. ⚠ `NULL` = applies across campaigns; set = campaign-specific. Whether campaign-specific outcomes are allowed is `OD-12`. |
| `key`             | text        | no   | Stable code                                                                 |
| `name`            | text        | no   |                                                                             |
| `sort_order`      | integer     | no   |                                                                             |
| `archived_at`     | timestamptz | yes  | Retired outcomes remain referenced by history.                              |
| `created_at`, `updated_at` | timestamptz | no |                                                                       |

- Unique (`organization_id`, `campaign_id`, `key`) `NULLS NOT DISTINCT` (`DB-06`).
- No outcome is flagged as "sale" or mapped to a funnel stage (`OD-31`). A mapping column can be added if those decisions require it.
- Initial outcome rows are seed/configuration data, not schema.

---

## 7. Funnel / KPI Model

| Concept                     | Table                 | Owner          |
| --------------------------- | --------------------- | -------------- |
| KPI definition              | `kpi_definitions`     | Performance    |
| KPI target / threshold      | `kpi_targets`         | Business Rules |
| Funnel / KPI input          | `funnel_kpi_inputs`   | Field          |
| Performance result          | Computed on read (Section 10) | Performance |

### Funnel Stage Enum

`funnel_stage` enum (fixed, standardized — 01 §9):

| Order | Value                    |
| ----- | ------------------------ |
| 1     | `ATTENTION_ENGAGEMENT`   |
| 2     | `PROBLEM_AWARENESS`      |
| 3     | `CONSEQUENCE_EVALUATION` |
| 4     | `SOLUTION_ALIGNMENT`     |
| 5     | `CLOSE_AGREEMENT`        |

### `kpi_definitions`

| Column            | Type                | Null | Notes                                                                  |
| ----------------- | ------------------- | ---- | ---------------------------------------------------------------------- |
| `id`              | uuid                | no   | PK                                                                     |
| `organization_id` | uuid                | no   | FK `organizations`                                                     |
| `campaign_id`     | uuid                | yes  | FK `campaigns`. `NULL` = organisation-wide; set = campaign-specific.   |
| `key`             | text                | no   |                                                                        |
| `name`            | text                | no   |                                                                        |
| `funnel_stage`    | enum `funnel_stage` | yes  | Set when the KPI measures a funnel stage. The stage lives here only, not on inputs. |
| `archived_at`     | timestamptz         | yes  |                                                                        |
| `created_at`, `updated_at` | timestamptz | no |                                                                       |

Unique (`organization_id`, `campaign_id`, `key`) `NULLS NOT DISTINCT`.

### `funnel_kpi_inputs`

| Column               | Type          | Null | Notes                                                                                     |
| -------------------- | ------------- | ---- | ----------------------------------------------------------------------------------------- |
| *common Field columns* |             |      |                                                                                           |
| `kpi_definition_id`  | uuid          | no   | FK `kpi_definitions`. **Reference only** (`AD-23`): Field stores it; Performance interprets it. |
| `value`              | numeric(12,2) | no   |                                                                                           |
| `door_activity_id`   | uuid          | yes  | FK `door_activities`. ⚠ Set for per-door input; `NULL` for aggregate input (`OD-13`).    |

- The foreign key is a database integrity constraint, not a runtime module call. Field code does not query `kpi_definitions` (`AD-23`).
- Both per-door and aggregate recording fit this table without redesign (`OD-13`).
- **Funnel integrity** (later-stage count ≤ earlier-stage count) is validated in NestJS. It is **not** a database constraint, because the aggregation it applies to (per door, per day, per deployment) depends on `OD-13`.

### `kpi_targets`

Owned by **Business Rules** (Section 13).

| Column               | Type          | Null | Notes                                                                    |
| -------------------- | ------------- | ---- | ------------------------------------------------------------------------ |
| `id`                 | uuid          | no   | PK                                                                       |
| `organization_id`    | uuid          | no   | FK `organizations`                                                       |
| `kpi_definition_id`  | uuid          | no   | FK `kpi_definitions`                                                     |
| `kind`               | enum `kpi_target_kind` | no | `TARGET` or `THRESHOLD`                                              |
| `campaign_id`        | uuid          | yes  | FK `campaigns`. Campaign-specific when set.                             |
| `role_id`            | uuid          | yes  | FK `roles`. Role-specific when set (01 §5 "targets"). ⚠ "status" dimension: `OD-32`. |
| `value`              | numeric(12,2) | no   |                                                                          |
| `effective_from`     | timestamptz   | no   | `DB-05`. Not earlier than `created_at` (check constraint).              |
| `created_by_user_id` | uuid          | no   | FK `users`                                                               |
| `created_at`         | timestamptz   | no   | **Append-only**; a change is a new row.                                 |

- Unique (`kpi_definition_id`, `kind`, `campaign_id`, `role_id`, `effective_from`) `NULLS NOT DISTINCT`.
- ⚠ The target period (e.g. per day or per deployment) and threshold meaning are not specified; the behaviour that uses thresholds is `OD-17`/`OD-18`.

---

## 8. Sales and Sale Status

### `sales`

| Column              | Type        | Null | Notes                                                                     |
| ------------------- | ----------- | ---- | ------------------------------------------------------------------------- |
| *common Field columns* |          |      | Campaign is derived through `deployment_id` — not duplicated.           |
| `agreed_at`         | timestamptz | no   | When customer agreement/sign-up was obtained (01 §10).                   |

- ⚠ Further sale fields are `OD-14`. IMPERIAL OS does not recreate client CRM data.
- There is **no** current-status column and **no** value or profit column.
- There is **no** link to a door activity (`OD-31`, Section 5).

### `sale_statuses`

Status **definitions**, owned by **Commercial Configuration** (`AD-07`).

| Column            | Type        | Null | Notes                                                                     |
| ----------------- | ----------- | ---- | ------------------------------------------------------------------------- |
| `id`              | uuid        | no   | PK                                                                        |
| `organization_id` | uuid        | no   | FK `organizations`                                                        |
| `campaign_id`     | uuid        | yes  | FK `campaigns`. Campaign-specific statuses where configured.             |
| `key`             | text        | no   |                                                                           |
| `name`            | text        | no   |                                                                           |
| `sort_order`      | integer     | no   | Display order only; it does **not** imply allowed transitions.           |
| `archived_at`     | timestamptz | yes  |                                                                           |
| `created_at`, `updated_at` | timestamptz | no |                                                                     |

Unique (`organization_id`, `campaign_id`, `key`) `NULLS NOT DISTINCT`.

Which status is the **Financial Confirmation State** is part of the effective-dated commercial configuration version (Section 9), so it is historically traceable. A configuration version **may** also name an initial sale status; whether it should, and which status, is unresolved (`OD-15`).

### `sale_status_history`

**Authoritative** record of a sale's status. Append-only.

| Column               | Type        | Null | Notes                                                                       |
| -------------------- | ----------- | ---- | --------------------------------------------------------------------------- |
| `id`                 | uuid        | no   | PK                                                                          |
| `sale_id`            | uuid        | no   | FK `sales`                                                                  |
| `sequence`           | integer     | no   | 1, 2, 3 … per sale. Unique (`sale_id`, `sequence`).                        |
| `sale_status_id`     | uuid        | no   | FK `sale_statuses`. The status entered.                                    |
| `changed_by_user_id` | uuid        | yes  | FK `users`. Managing Director for updates; `NULL` for an initial system entry (only written when an initial status is configured). |
| `changed_at`         | timestamptz | no   |                                                                             |
| `created_at`         | timestamptz | no   |                                                                             |

- No `from_status` column: the previous status is the previous `sequence` row. Storing it would duplicate history.
- **Current status** is derived: the row with the highest `sequence`. It is exposed through a read-only database view `sale_current_statuses` (Section 21). There is no stored copy. A sale with no history rows has **no** current status, and the view returns no status for it.
- ⚠ **Initial status.** The schema can store an initial status-history entry (`sequence` 1) when a sale is accepted. That entry is written **only** if the applicable commercial configuration version has an `initial_sale_status_id`. If it is `NULL`, the database does not invent a status and no initial history row is created, so a newly created sale may have no current status. Whether sales should start in a status, and which one, is **not specified** by the current product documentation and remains unresolved under `OD-15`.
- ⚠ **Allowed transitions.** No transition table exists in V1 (Section 13). Which statuses may follow which, reversals and end states remain governed by `OD-15` / Business Rules, and are modelled after `OD-15` is resolved. The database is neutral: it accepts any history row whose status exists for the sale's organisation and campaign scope.
- ⚠ **Sale-status endpoint.** The Managing Director's sale-status update endpoint is **provisional**. Beyond permission (`sale_status.update`) and structural validity, no rule for which statuses may be set is chosen here; that is blocked on `OD-15`.

### Financial Values

See Section 10 (`sale_financial_values`). Predicted and Actual/Realised values are derived and reference the configuration version used.

---

## 9. Commercial Configuration

Module: **Commercial Configuration**. All rows are **immutable versions** (`AD-20`, `DB-05`). A change is a new row with a later `effective_from`.

### `commercial_configuration_versions`

Campaign/client commercial terms.

| Column                              | Type          | Null | Notes                                                                                  |
| ----------------------------------- | ------------- | ---- | -------------------------------------------------------------------------------------- |
| `id`                                | uuid          | no   | PK — the identifier used by calculations (`AD-21`).                                    |
| `organization_id`                   | uuid          | no   | FK `organizations`                                                                     |
| `campaign_id`                       | uuid          | no   | FK `campaigns`. Campaign/client sale value is campaign-specific (01 §10). Client: `OD-30`. |
| `version_number`                    | integer       | no   | 1, 2, 3 … per campaign.                                                                |
| `effective_from`                    | timestamptz   | no   | Not earlier than `created_at` (check constraint, `DB-05`).                             |
| `sale_value_amount`                 | numeric(12,2) | no   |                                                                                        |
| `currency_code`                     | char(3)       | no   | `DB-03`                                                                                |
| `initial_sale_status_id`            | uuid          | **yes** | FK `sale_statuses`. ⚠ Optional. A version **may** specify an initial sale status; when `NULL`, none is invented and no initial history row is written (Section 8). The initial-status business rule is unresolved (`OD-15`); no value is seeded or assumed. |
| `financial_confirmation_status_id`  | uuid          | no   | FK `sale_statuses`. The **Financial Confirmation State**.                              |
| `expected_processing_days`          | integer       | yes  | ⚠ Expected processing/payment timeframe. Granularity not specified (04 §3.7); stored per campaign version provisionally. Use in calculation: `OD-16`. |
| `created_by_user_id`                | uuid          | no   | FK `users`                                                                             |
| `created_at`                        | timestamptz   | no   | **Append-only**; no `updated_at`.                                                      |

- Unique (`campaign_id`, `version_number`); unique (`campaign_id`, `effective_from`).
- `initial_sale_status_id` (when set) and `financial_confirmation_status_id` may only reference sale statuses of the **same organisation** whose scope is compatible with the version's campaign (the same campaign, or organisation-wide). This is structural validation in NestJS (Section 18), not a business decision.
- The version applying to a sale is the latest with `effective_from ≤ sales.agreed_at`. ⚠ Whether `agreed_at` or acceptance time is the reference point is part of `OD-16`; the reference used is recorded on the financial value, so either is reproducible.

### `day_rates`

⚠ `OD-29`: the level at which a day rate is set is undecided. Optional dimension columns support every listed level without a rules engine.

| Column               | Type          | Null | Notes                                         |
| -------------------- | ------------- | ---- | --------------------------------------------- |
| `id`                 | uuid          | no   | PK                                            |
| `organization_id`    | uuid          | no   | FK `organizations`                            |
| `user_id`            | uuid          | yes  | FK `users`. Per-Associate rate when set.     |
| `role_id`            | uuid          | yes  | FK `roles`. Per-role rate when set.          |
| `campaign_id`        | uuid          | yes  | FK `campaigns`. Per-campaign rate when set.  |
| `effective_from`     | timestamptz   | no   | Effective dates for day-rate changes (01 §10). Not earlier than `created_at` (check constraint, `DB-05`). |
| `rate_amount`        | numeric(12,2) | no   |                                               |
| `currency_code`      | char(3)       | no   |                                               |
| `created_by_user_id` | uuid          | no   | FK `users`                                    |
| `created_at`         | timestamptz   | no   | **Append-only**; no `updated_at`.             |

- Unique (`organization_id`, `user_id`, `role_id`, `campaign_id`, `effective_from`) `NULLS NOT DISTINCT`.
- ⚠ Which combinations are valid, and which applies when several match, is decided by `OD-29` and implemented in NestJS. No precedence is encoded in the database.

### Not Modelled

| Concept           | Reason                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| Client entity     | `OD-30`. `campaigns.client_reference` is a provisional label only.          |
| Commercial rules  | Content not specified (04 §13). No table until defined.                     |

---

## 10. Performance

Module: **Performance**.

| Layer                 | Where                                                        |
| --------------------- | ------------------------------------------------------------ |
| Source facts          | Field tables (Section 5), `sale_status_history`              |
| Configuration         | `kpi_definitions`, `kpi_targets`, `commercial_configuration_versions`, `day_rates` |
| Derived calculations  | `sale_financial_values` (stored); KPI/funnel results and profitability (computed on read in V1) |

### `sale_financial_values`

Stored because each value must record the configuration version it used (`AD-21`).

| Column                                  | Type          | Null | Notes                                                                     |
| --------------------------------------- | ------------- | ---- | ------------------------------------------------------------------------- |
| `id`                                    | uuid          | no   | PK                                                                        |
| `sale_id`                               | uuid          | no   | FK `sales`                                                                |
| `kind`                                  | enum `financial_value_kind` | no | `PREDICTED` or `ACTUAL_REALISED`                                  |
| `amount`                                | numeric(12,2) | no   |                                                                           |
| `currency_code`                         | char(3)       | no   |                                                                           |
| `commercial_configuration_version_id`   | uuid          | no   | FK `commercial_configuration_versions`                                    |
| `sale_status_history_id`                | uuid          | yes  | FK `sale_status_history`. For `ACTUAL_REALISED`: the entry that reached the Financial Confirmation State. |
| `calculated_at`                         | timestamptz   | no   |                                                                           |
| `superseded_at`                         | timestamptz   | yes  | Set when recalculated; the replacement is a new row.                     |
| `created_at`                            | timestamptz   | no   |                                                                           |
| `updated_at`                            | timestamptz   | no   | Setting `superseded_at` is the only permitted update.                    |

- Partial unique index: one non-superseded row per (`sale_id`, `kind`).
- Check constraint: `sale_status_history_id` is present **if and only if** `kind = 'ACTUAL_REALISED'`. A `PREDICTED` value never references a status-history entry.
- Rows are derived and recomputable from facts and configuration; they are never edited by users.
- **Write path (`AD-25`).** Performance writes these rows. Field never calls Performance: after Field commits a sale or a sale status-history entry, it emits an in-process event, and Performance handles it in its own transaction. The formula Performance applies is not defined here (`OD-16`).
- ⚠ Reversal after Actual/Realised (`OD-15`) would supersede the row; no reversal behaviour is encoded.

### KPI / Funnel Results and Profitability

| ID    | Decision                                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB-09 | ⚠ KPI/funnel results and predicted/actual profitability are **computed on read** in V1 from Field inputs, `sale_financial_values`, `day_rates` and `kpi_targets`. No `performance_results` or `profitability_results` table is created initially, because the profitability formula and period (`OD-16`) are undecided and stored results would encode them. A results/snapshot table can be added later as a cache, never as a source of truth. |

There is no column anywhere for manually entered profit.

---

## 11. Learning

Module: **Learning**. Content is Admin-managed configuration; records are per Associate.

### Content

| Table              | Key columns                                                                                                         | Notes |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ----- |
| `curricula`        | `id`, `organization_id`, `campaign_id` (nullable FK, `AD-23`), `title`, `description`, `archived_at`, `created_by_user_id`, timestamps | `campaign_id` set = campaign-specific learning. No "readiness" flag (readiness is decided by `readiness_requirements`). |
| `learning_modules` | `id`, `curriculum_id` FK, `title`, `sort_order`, timestamps                                                         | Named `learning_modules` to avoid confusion with backend "modules". |
| `lessons`          | `id`, `learning_module_id` FK, `title`, `content_type` enum `lesson_content_type` (`WRITTEN`, `VIDEO`), `body` text nullable, `media_object_key` text nullable, `sort_order`, timestamps | Media stored externally (`AQ-02`); only the key is stored. |
| `quizzes`          | `id`, `organization_id`, `title`, `content` jsonb, `archived_at`, `created_by_user_id`, timestamps                  | ⚠ Question format and scoring: `OD-07`. |
| `assessments`      | `id`, `organization_id`, `title`, `description`, `content` jsonb nullable, `archived_at`, `created_by_user_id`, timestamps | ⚠ `OD-07`. |
| `roleplays`        | `id`, `organization_id`, `title`, `scenario` text, `archived_at`, `created_by_user_id`, timestamps                  | ⚠ Format: `OD-08`. |

⚠ How quizzes, assessments and roleplays are positioned within a curriculum is not specified (04 §12). They are standalone items, linked to Associates through `assignments` and to readiness through `readiness_requirements`. A positioning link can be added later.

### Associate Records

| Table                  | Key columns                                                                                                                                         | Notes |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `assignments`          | `id`, `organization_id`, `user_id` FK, `reason` enum `assignment_reason` (`READINESS`, `CAMPAIGN_PREPARATION`, `IMPROVEMENT`), exactly one of `curriculum_id` / `quiz_id` / `assessment_id` / `roleplay_id`, `campaign_id` nullable (context, `AD-23`), `assigned_by_user_id` nullable, `assigned_at`, `created_at` | ⚠ Who creates `IMPROVEMENT` assignments: `OD-17`. `assigned_by_user_id` `NULL` allows system assignment without deciding it. |
| `learning_progress`    | `id`, `assignment_id` FK, `lesson_id` nullable FK, `started_at` nullable, `completed_at` nullable, `created_at`, `updated_at`                       | Unique (`assignment_id`, `lesson_id`) `NULLS NOT DISTINCT`. ⚠ Progress states: `OD-09` — timestamps only, no state enum. |
| `quiz_attempts`        | `id`, `organization_id` FK (`DB-04`), `quiz_id` FK, `user_id` FK, `assignment_id` nullable FK, `answers` jsonb, `result` jsonb nullable, `submitted_at`, `created_at` | ⚠ Result structure: `OD-07`. Append-only. |
| `submissions`          | `id`, `organization_id` FK (`DB-04`), `user_id` FK, `assignment_id` nullable FK, exactly one of `assessment_id` / `roleplay_id`, `content` text nullable, `media_object_key` nullable, `submitted_at`, `created_at` | ⚠ Submission format: `OD-07`, `OD-08`. Append-only. |
| `submission_feedback`  | `id`, `submission_id` FK, `given_by_user_id` nullable FK, `body` text, `reassessment_required` boolean nullable, `created_at`                       | ⚠ Feedback provider: `OD-08`. Table name avoids the uncountable "feedback". Append-only. |

---

## 12. Readiness

Requirements are owned by **Business Rules**; submissions, evidence and decisions by **Readiness** (`AD-10`).

### `readiness_requirements`

| Column            | Type        | Null | Notes                                                                                |
| ----------------- | ----------- | ---- | ------------------------------------------------------------------------------------ |
| `id`              | uuid        | no   | PK                                                                                   |
| `organization_id` | uuid        | no   | FK `organizations`                                                                   |
| `title`           | text        | no   |                                                                                      |
| `description`     | text        | yes  |                                                                                      |
| `curriculum_id`   | uuid        | yes  | FK. ⚠ Exactly one learning item reference when the requirement is learning-based.  |
| `quiz_id`         | uuid        | yes  | FK                                                                                   |
| `assessment_id`   | uuid        | yes  | FK                                                                                   |
| `roleplay_id`     | uuid        | yes  | FK                                                                                   |
| `archived_at`     | timestamptz | yes  |                                                                                      |
| `created_at`, `updated_at` | timestamptz | no |                                                                               |

- Check: at most one learning reference. ⚠ Requirement types beyond learning items (e.g. onboarding documentation) and completion criteria are `OD-06`/`OD-05`; a requirement with no reference is allowed provisionally.
- This table — not `curricula` — determines what counts toward readiness.

### `readiness_submissions`

| Column              | Type        | Null | Notes              |
| ------------------- | ----------- | ---- | ------------------ |
| `id`                | uuid        | no   | PK                 |
| `organization_id`   | uuid        | no   | FK                 |
| `associate_user_id` | uuid        | no   | FK `users`         |
| `submitted_at`      | timestamptz | no   |                    |
| `created_at`        | timestamptz | no   |                    |

**Append-only.** ⚠ Whether resubmission is allowed is `OD-03`; the table permits multiple submissions per Associate without encoding the rule.

### `readiness_evidence`

References to learning records considered for each requirement at submission time. **References only**; no learning data is copied (`AD-10`). **Append-only.**

| Column                      | Type    | Null | Notes                                              |
| --------------------------- | ------- | ---- | -------------------------------------------------- |
| `id`                        | uuid    | no   | PK                                                 |
| `readiness_submission_id`   | uuid    | no   | FK                                                 |
| `readiness_requirement_id`  | uuid    | no   | FK                                                 |
| `learning_progress_id`      | uuid    | yes  | FK. At most one evidence reference is set.        |
| `quiz_attempt_id`           | uuid    | yes  | FK                                                 |
| `submission_id`             | uuid    | yes  | FK                                                 |
| `created_at`                | timestamptz | no |                                                  |

Unique (`readiness_submission_id`, `readiness_requirement_id`).

### `readiness_decisions`

Append-only and auditable.

| Column                    | Type        | Null | Notes                                                                      |
| ------------------------- | ----------- | ---- | -------------------------------------------------------------------------- |
| `id`                      | uuid        | no   | PK                                                                         |
| `readiness_submission_id` | uuid        | no   | FK. Unique — one decision per submission.                                 |
| `decision`                | enum `readiness_decision` | no | `APPROVED` or `REJECTED`                                          |
| `decided_by_user_id`      | uuid        | no   | FK `users`. Must hold `readiness.approve` (Managing Director) — NestJS.  |
| `decided_at`              | timestamptz | no   |                                                                            |
| `comment`                 | text        | yes  | ⚠ Optional. Whether it is shown to the Associate as feedback is `OD-03`. |
| `created_at`              | timestamptz | no   |                                                                            |

**Readiness state is derived**, not stored: an Associate is Field Ready when their latest decided submission is `APPROVED`. ⚠ Loss of readiness after approval: `OD-28`.

---

## 13. Business Rules

Only rule categories with a required, defined shape are tables. No generic rules engine (`AD-12`).

| Rule category (01 §12)      | Storage                                     | Status          |
| --------------------------- | ------------------------------------------- | --------------- |
| Readiness requirements      | `readiness_requirements` (Section 12)       | Modelled        |
| KPI targets / thresholds    | `kpi_targets` (Section 7)                   | Modelled        |
| Sale-status rules (allowed transitions) | —                               | Not modelled until `OD-15` |
| Approvals                   | `permission_grants` (`readiness.approve` → Managing Director) | Modelled; approver fixed in V1 |
| Callbacks                   | —                                           | Not modelled until `OD-01` |
| EOD deadlines               | —                                           | Not modelled until `OD-02` |
| Operating thresholds        | —                                           | Not modelled until defined (`OD-18`) |
| Commercial rules            | —                                           | Not specified (04 §13) |

⚠ **Sale-status transitions.** Allowed transitions, reversals after Actual/Realised and non-realised end states are owned by Business Rules (`AD-07`) and remain unresolved (`OD-15`). Their shape is not defined, so V1 has **no** transition table. They are modelled in an additive migration once `OD-15` is resolved. Until then, the database stays neutral and the sale-status update endpoint is provisional (Section 8).

---

## 14. Offline Synchronization

The five sync states — **Saved locally, Pending sync, Syncing, Successfully synced, Sync failed** — are **client-side only**. They are **not** stored on the server.

The server stores **receipts**: what it received and the outcome. Receipts are **append-only**. `organization_id` is assigned from the authenticated user's organisational assignment (`DB-04`).

### `sync_receipts`

| Column                | Type        | Null | Notes                                                                                     |
| --------------------- | ----------- | ---- | ----------------------------------------------------------------------------------------- |
| `id`                  | uuid        | no   | PK (server-generated)                                                                     |
| `organization_id`     | uuid        | no   | FK                                                                                        |
| `client_operation_id` | uuid        | no   | Client-generated operation ID. **Unique.**                                                |
| `user_id`             | uuid        | no   | FK `users`. Authenticated sender.                                                         |
| `device_id`           | text        | yes  | Client-supplied device identifier, for diagnostics and per-device ordering.               |
| `operation_type`      | text        | no   | e.g. `door_activity.create`, `sale.create`. Validated by NestJS against the known set.   |
| `entity_id`           | uuid        | yes  | ID of the resulting business record (equals the client-generated record ID when accepted). |
| `payload_hash`        | text        | no   | Hash of the received payload. A repeat with the same ID and a different hash is flagged.   |
| `result`              | enum `sync_result` | no | `ACCEPTED` or `REJECTED`                                                             |
| `rejection_code`      | text        | yes  | Set when `REJECTED`.                                                                      |
| `received_at`         | timestamptz | no   |                                                                                           |
| `processed_at`        | timestamptz | no   |                                                                                           |
| `created_at`          | timestamptz | no   |                                                                                           |

### Idempotency

1. The receipt and the business record are written in **one transaction**.
2. If `client_operation_id` already has a receipt, the server returns the stored result and writes nothing.
3. Field record primary keys are the client-generated record IDs, so even a race cannot create a second record.
4. Transient failures (server error, timeout) roll back and leave **no** receipt; the client retries.
5. ⚠ Whether a `REJECTED` operation may be retried with the same ID, or must be resent with a new one, is `OD-19`.
6. Reconciliation: the client queries receipts by `client_operation_id` to correct its local states.

---

## 15. Audit / History

| Requirement                         | Structure                                         | Notes                                                    |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| Field Readiness approval            | `readiness_decisions` + `audit_events`            | **Required** (01 §6).                                    |
| Sale status changes                 | `sale_status_history`                             | Authoritative history.                                   |
| Commercial configuration versions   | `commercial_configuration_versions`, `day_rates`  | Immutable versions with actor and time.                 |
| KPI targets / thresholds            | `kpi_targets`                                     | Immutable versions.                                      |
| Synchronization receipts            | `sync_receipts`                                   |                                                          |
| Role changes                        | `role_assignments`                                | Start/end rows.                                          |
| Other important configuration changes | `audit_events`                                  | ⚠ Which changes are audited, and how history is viewed: `OD-24`. |

### `audit_events`

A small, append-only table for events that do not already have their own history table.

| Column             | Type        | Null | Notes                                                |
| ------------------ | ----------- | ---- | ---------------------------------------------------- |
| `id`               | uuid        | no   | PK                                                   |
| `organization_id`  | uuid        | no   | FK                                                   |
| `actor_user_id`    | uuid        | yes  | FK `users`. `NULL` for system actions.              |
| `action`           | text        | no   | e.g. `readiness.decision.recorded`, `campaign.updated` |
| `subject_type`     | text        | no   | Table/entity name                                    |
| `subject_id`       | uuid        | no   |                                                      |
| `occurred_at`      | timestamptz | no   |                                                      |
| `details`          | jsonb       | yes  | Small, non-authoritative context (e.g. changed field names). Never the only copy of business data. |

Written only by the backend (`AD-22`). No retention period is defined.

---

## 16. Relationships and Foreign Keys

Cardinality: `1—N` one-to-many; `N—1` many-to-one. "Opt" = nullable FK.

| Table                              | PK  | Important FKs (cardinality)                                                                 | Owner          | Important uniqueness |
| ---------------------------------- | --- | ------------------------------------------------------------------------------------------- | -------------- | -------------------- |
| `organizations`                    | id  | —                                                                                           | Identity       | — |
| `users`                            | id  | —                                                                                           | Identity       | `auth_subject`, `email` (when present) |
| `organizational_assignments`       | id  | user N—1; organization N—1                                                                  | Identity       | One current row per (user, organization) |
| `roles`                            | id  | —                                                                                           | Identity       | `key` |
| `role_assignments`                 | id  | user N—1; organization N—1; role N—1                                                        | Identity       | One current row per (user, organization, role) |
| `perspectives` / `role_perspectives` | id / composite | role N—N perspective                                                             | Access         | `key`; (role, perspective) |
| `scopes`                           | id  | organization N—1                                                                            | Access         | (organization, scope_type, target_id) NND |
| `permissions`                      | id  | —                                                                                           | Access         | `key` |
| `permission_grants`                | id  | role N—1; permission N—1; scope N—1                                                         | Access         | (role, permission, scope) |
| `campaigns`                        | id  | organization N—1                                                                            | Deployment     | (organization, name) |
| `territories`                      | id  | organization N—1. **No campaign FK** (`OD-11`)                                              | Deployment     | (organization, name) |
| `deployments`                      | id  | organization N—1; associate user N—1; campaign N—1; territory N—1; state N—1                | Deployment     | **None** on active per Associate (`OD-11`) |
| `door_outcomes`                    | id  | organization N—1; campaign N—1 opt                                                          | Field          | (organization, campaign, key) NND |
| `door_activities`                  | id (client) | organization N—1; deployment N—1; recorded_by user N—1; door_outcome N—1          | Field          | PK |
| `funnel_kpi_inputs`                | id (client) | organization N—1; deployment N—1; recorded_by user N—1; kpi_definition N—1 (reference, `AD-23`); door_activity N—1 opt (`OD-13`) | Field          | PK |
| `sales`                            | id (client) | organization N—1; deployment N—1; recorded_by user N—1. **No door_activity FK** (`OD-31`) | Field          | PK |
| `sale_status_history`              | id  | sale N—1; sale_status N—1; changed_by user N—1 opt                                          | Field          | (sale, sequence) |
| `callbacks`                        | id (client) | organization N—1; deployment N—1; recorded_by user N—1. **No door_activity FK**   | Field          | PK |
| `notes`                            | id (client) | organization N—1; deployment N—1; recorded_by user N—1; door_activity / sale / callback N—1 opt (at most one) | Field          | PK |
| `eod_records`                      | id (client) | organization N—1; recorded_by user N—1; deployment N—1 opt                        | Field          | PK |
| `sale_statuses`                    | id  | organization N—1; campaign N—1 opt                                                          | Commercial     | (organization, campaign, key) NND |
| `commercial_configuration_versions`| id  | organization N—1; campaign N—1; financial-confirmation sale_status N—1; initial sale_status N—1 opt (`OD-15`) | Commercial     | (campaign, version_number); (campaign, effective_from) |
| `day_rates`                        | id  | organization N—1; user / role / campaign N—1 opt (`OD-29`)                                  | Commercial     | (organization, user, role, campaign, effective_from) NND |
| `kpi_definitions`                  | id  | organization N—1; campaign N—1 opt                                                          | Performance    | (organization, campaign, key) NND |
| `kpi_targets`                      | id  | organization N—1; kpi_definition N—1; campaign / role N—1 opt                               | Business Rules | (kpi_definition, kind, campaign, role, effective_from) NND |
| `sale_financial_values`            | id  | sale N—1; commercial_configuration_version N—1; sale_status_history N—1 opt                 | Performance    | One non-superseded per (sale, kind) |
| `curricula`                        | id  | organization N—1; campaign N—1 opt (`AD-23`)                                                | Learning       | — |
| `learning_modules` / `lessons`     | id  | curriculum 1—N modules; module 1—N lessons                                                  | Learning       | — |
| `quizzes` / `assessments` / `roleplays` | id | organization N—1                                                                        | Learning       | — |
| `assignments`                      | id  | organization N—1; user N—1; exactly one learning item N—1; campaign N—1 opt                 | Learning       | — |
| `learning_progress`                | id  | assignment N—1; lesson N—1 opt                                                              | Learning       | (assignment, lesson) NND |
| `quiz_attempts`                    | id  | organization N—1; quiz N—1; user N—1; assignment N—1 opt                                    | Learning       | — |
| `submissions`                      | id  | organization N—1; user N—1; assessment or roleplay N—1; assignment N—1 opt                  | Learning       | — |
| `submission_feedback`              | id  | submission N—1; given_by user N—1 opt                                                       | Learning       | — |
| `readiness_requirements`           | id  | organization N—1; one learning item N—1 opt                                                 | Business Rules | — |
| `readiness_submissions`            | id  | organization N—1; associate user N—1                                                        | Readiness      | — |
| `readiness_evidence`               | id  | submission N—1; requirement N—1; progress / quiz_attempt / submission N—1 opt              | Readiness      | (submission, requirement) |
| `readiness_decisions`              | id  | submission 1—1; decided_by user N—1                                                         | Readiness      | `readiness_submission_id` |
| `sync_receipts`                    | id  | user N—1; organization N—1                                                                  | Sync           | `client_operation_id` |
| `audit_events`                     | id  | actor user N—1 opt                                                                          | Audit          | — |

### Relationships Requiring Particular Care

| Relationship                          | Design                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| User ↔ Organisation                  | Only through `organizational_assignments`. No `organization_id` on `users`.                                   |
| User ↔ Role Assignment               | History rows; current = `ends_at IS NULL`.                                                                     |
| Associate ↔ Deployment               | N—1 from deployments; no limit on concurrent active deployments (`OD-11`).                                    |
| Campaign ↔ Territory                 | No direct FK; related through Deployment (`OD-11`).                                                           |
| Deployment ↔ Campaign / Territory    | Required FKs. Mutability after creation is not specified; none is encoded.                                     |
| Field records ↔ Associate / Deployment | Required `organization_id`, `deployment_id` (nullable for EOD) and `recorded_by_user_id` on all six Field tables. |
| Field records ↔ each other           | Only `funnel_kpi_inputs.door_activity_id` (`OD-13`) and the optional note subjects (04 §3.6). No link from sales (`OD-31`) or callbacks (`OD-01`) to door activities. |
| Sale ↔ Sale Status History           | 1—N; history authoritative; current status via view.                                                          |
| Sale ↔ Commercial Configuration      | Through `sale_financial_values.commercial_configuration_version_id`; not stored on `sales`.                    |
| KPI Input ↔ KPI Definition           | Required FK as reference only (`AD-23`).                                                                       |
| Learning ↔ Campaign                  | Nullable `campaign_id` on `curricula` and `assignments` (`AD-23`).                                            |
| Readiness ↔ Learning evidence        | `readiness_evidence` holds references to learning records; nothing copied.                                    |
| Sync receipt ↔ client operation ID   | Unique `client_operation_id`; `entity_id` points to the resulting record.                                     |

All FKs use `ON DELETE RESTRICT` unless stated otherwise. Child content rows (`learning_modules`, `lessons`) may use `ON DELETE CASCADE` from their parent only while the parent has never been referenced by Associate records; in practice configuration is archived, not deleted.

---

## 17. Index Strategy

Primary keys and unique constraints already create indexes. Additional indexes:

| Access path                         | Index                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| User lookup                         | Unique `users(auth_subject)`, unique `users(email)` (partial, where not null).                       |
| Active role assignments             | `role_assignments(user_id) WHERE ends_at IS NULL`.                                                    |
| Active organisational assignment    | `organizational_assignments(user_id) WHERE ends_at IS NULL`.                                         |
| Deployments by Associate            | `deployments(associate_user_id, starts_at)`.                                                           |
| Deployments by campaign             | `deployments(campaign_id)`.                                                                            |
| Field records by deployment/date    | `door_activities(deployment_id, recorded_at)`; same on `funnel_kpi_inputs`, `sales`, `callbacks`, `notes`. |
| Field records by Associate/date     | `door_activities(recorded_by_user_id, recorded_at)`; same on `funnel_kpi_inputs`, `sales`.             |
| EOD                                 | `eod_records(recorded_by_user_id, report_date)`.                                                       |
| Sales by agreement time             | `sales(deployment_id, agreed_at)`.                                                                     |
| Sale status history                 | Unique (`sale_id`, `sequence`) serves current-status lookup; `sale_status_history(sale_status_id)` for status reports. |
| KPI inputs by definition            | `funnel_kpi_inputs(kpi_definition_id)`.                                                                |
| Financial values                    | Partial unique (`sale_id`, `kind`) `WHERE superseded_at IS NULL`.                                     |
| Learning progress                   | `assignments(user_id)`; unique (`assignment_id`, `lesson_id`).                                         |
| Readiness                           | `readiness_submissions(associate_user_id, submitted_at)`.                                              |
| Sync operation IDs                  | Unique `sync_receipts(client_operation_id)`; `sync_receipts(user_id, received_at)`.                   |
| Configuration effective dates       | Unique (`campaign_id`, `effective_from`) on `commercial_configuration_versions`; `day_rates(organization_id, effective_from)`; `kpi_targets(kpi_definition_id, effective_from)`. |
| Audit                               | `audit_events(subject_type, subject_id)`.                                                              |

Foreign key columns used in joins listed above are indexed; other FK columns are indexed only if a query need appears.

---

## 18. Constraints and Invariants

### Database Constraints (safe, structural)

| Constraint                                                         | Mechanism                         |
| ------------------------------------------------------------------ | --------------------------------- |
| Unique client operation ID                                         | Unique index                      |
| Client-generated Field record IDs cannot be duplicated             | Primary key                       |
| Valid ownership relationships                                      | Foreign keys, `NOT NULL`          |
| Unique configuration versions per campaign                         | Unique (`campaign_id`, `version_number`), (`campaign_id`, `effective_from`) |
| No duplicate current assignment of the same role                   | Partial unique index              |
| One current organisational assignment per user and organisation    | Partial unique index              |
| One decision per readiness submission                              | Unique `readiness_submission_id`  |
| Ordered, gap-free-by-convention status history                     | Unique (`sale_id`, `sequence`)    |
| One current financial value per sale and kind                      | Partial unique index              |
| Exactly one learning item on an assignment                          | Check constraint                  |
| Exactly one of assessment/roleplay on a submission                  | Check constraint                  |
| At most one learning reference on a readiness requirement / evidence | Check constraint                |
| At most one subject on a note                                       | Check constraint                  |
| Non-negative money amounts                                          | Check constraint                  |
| `ends_at` after `starts_at` where both present (assignments)        | Check constraint                  |
| No back-dated configuration: `effective_from` ≥ `created_at` on `commercial_configuration_versions`, `day_rates`, `kpi_targets` (`DB-05`) | Check constraint |
| `sale_financial_values.sale_status_history_id` present if and only if `kind = 'ACTUAL_REALISED'` | Check constraint |

### Business Rules Enforced in NestJS (not in the database)

| Rule                                                              | Reason it is not a DB constraint                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Later funnel-stage count ≤ earlier-stage count                    | Aggregation level depends on `OD-13`.                                           |
| Only the Managing Director approves readiness / updates sale status | Permission evaluation (`permission_grants`).                                 |
| Allowed sale status transitions                                   | Not modelled; blocked on `OD-15`. The endpoint is provisional (Section 8).      |
| Commercial configuration versions reference only sale statuses of the same organisation, with a compatible scope (same campaign or organisation-wide) | Cross-row scope check; structural validation, not a business decision. |
| `organization_id` assigned from trusted parent / authenticated-user context; never chosen by the client | Tenant integrity (`DB-04`).                       |
| Associate may only record against their own deployment            | Access rule (`AD-16`).                                                          |
| Deployment requires a Field Ready Associate                       | Derived readiness state.                                                        |
| Day-rate selection when several rows match                        | `OD-29`.                                                                        |
| One current role per user                                         | Not specified; provisional application rule.                                    |
| Profitability calculation                                         | `OD-16`.                                                                        |

### Explicitly **Not** Constrained (unresolved decisions)

- One active deployment per Associate (`OD-11`).
- Any link between sales, door activities and funnel Close / Agreement inputs, or any reconciliation between them (`OD-31`).
- Allowed sale-status transitions, and whether a sale starts in a status (`OD-15`).
- One EOD per Associate per day (`OD-02`, `OD-22`).
- Resubmission limits for readiness (`OD-03`).
- Required sale fields beyond those listed (`OD-14`).

---

## 19. Open-Decision Impact

| OD      | Affected area                         | Current provisional approach                                                                | May change when resolved                                                   |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `OD-01` | `callbacks`                           | Minimal columns (`details`).                                                                 | Due-date / escalation columns added.                                       |
| `OD-02` | `eod_records`                         | No deadline columns or uniqueness.                                                           | Deadline rule table or uniqueness per day.                                 |
| `OD-03` | `readiness_submissions`, `readiness_decisions` | Multiple submissions allowed; optional `comment`.                                 | Resubmission rules; rejection feedback structure.                          |
| `OD-04` | `users`, environment bootstrap        | `auth_subject`, `email` nullable. Initial Managing Director provisioning is a bootstrap step whose method is not decided (Section 22). | Columns become required; provisioning fields; bootstrap method.            |
| `OD-05` | Readiness / Identity                  | No onboarding table; requirements may have no learning reference.                           | Onboarding table or requirement types.                                     |
| `OD-06` | `readiness_requirements`              | Optional single learning reference.                                                          | Requirement type enum; completion criteria columns.                        |
| `OD-07` | `quizzes`, `assessments`, `quiz_attempts` | `content` / `result` as JSON.                                                         | Relational question/answer and scoring tables.                             |
| `OD-08` | `roleplays`, `submissions`, `submission_feedback` | Text/media key; nullable feedback giver.                                      | Format-specific columns; required feedback giver.                          |
| `OD-09` | `learning_progress`                   | Timestamps only.                                                                             | State column or completion criteria.                                       |
| `OD-11` | `territories`, `deployments`, `deployment_states` | No Territory→Campaign FK; state is the only lifecycle indicator, seeded `ACTIVE`; no `ends_at`; no single-active constraint. | Campaign FK/join table; more states; possible uniqueness.                |
| `OD-12` | `door_outcomes`                       | Configurable lookup; optional campaign scope.                                               | Fixed set or campaign-scoping rule; possible outcome→stage mapping.        |
| `OD-13` | `funnel_kpi_inputs`                   | Optional `door_activity_id` supports per-door and aggregate.                                | Column made required or removed; DB-level validation scope.                |
| `OD-14` | `sales`                               | Minimal fields (`agreed_at`).                                                                | Additional sale columns.                                                   |
| `OD-15` | `sale_status_history`, `commercial_configuration_versions.initial_sale_status_id`, `sale_financial_values` | No transition table; neutral database; provisional endpoint; optional initial status (no history row when `NULL`); append-only history; supersede on recalculation. | Transition rules table; reversal handling; end states; initial-status rule. |
| `OD-16` | Performance                           | Profitability computed on read; `expected_processing_days` stored, unused.                  | Results table; period columns; timeframe usage.                            |
| `OD-17` | `assignments`                         | `reason = IMPROVEMENT`, nullable `assigned_by_user_id`.                                     | Required assigner, or system-generated link to performance data.          |
| `OD-19` | `sync_receipts`                       | `REJECTED` receipts stored; repeat returns stored result.                                   | Retry-with-same-ID semantics.                                              |
| `OD-21` | Field tables                          | `updated_at` present; no edit history.                                                       | Edit history tables; conflict handling.                                    |
| `OD-22` | `eod_records`                         | `content` JSON; `processed_at`.                                                              | Relational EOD structure; draft storage.                                   |
| `OD-24` | `audit_events`                        | Approvals plus important configuration changes.                                             | Wider audit coverage; views.                                               |
| `OD-26` | `role_assignments`                    | Role history rows.                                                                           | Progression metadata.                                                      |
| `OD-28` | Readiness, configuration              | Readiness derived from decisions; configuration archived/versioned.                         | Readiness revocation records; versioning of non-commercial configuration. |
| `OD-29` | `day_rates`                           | Optional user / role / campaign dimensions.                                                 | Dimensions narrowed; precedence defined.                                   |
| `OD-30` | `campaigns`                           | `client_reference` text; no Client table.                                                    | `clients` table with FK from campaigns and commercial versions.            |
| `OD-31` | `sales`, `door_activities`, `funnel_kpi_inputs`, `door_outcomes` | Separate records; no sale→door link; no outcome→sale/stage mapping; nothing derived. The only door link is the per-door funnel input (`OD-13`), which does not equate records. | Required links, outcome→sale/stage mapping, or reconciliation rules.   |
| `OD-32` | `users`, `role_assignments`, `kpi_targets`, `day_rates` | No status column; role is the only dimension.            | Status column/table; status dimension on targets and day rates.            |

---

## 20. Proposed Table Inventory

| Domain                       | Tables |
| ---------------------------- | ------ |
| Identity                     | `organizations`, `users`, `organizational_assignments`, `roles`, `role_assignments` |
| Access                       | `perspectives`, `role_perspectives`, `scopes`, `permissions`, `permission_grants` |
| Deployment                   | `campaigns`, `territories`, `deployment_states`, `deployments` |
| Field                        | `door_outcomes`, `door_activities`, `funnel_kpi_inputs`, `sales`, `sale_status_history`, `callbacks`, `notes`, `eod_records` |
| Commercial Configuration     | `sale_statuses`, `commercial_configuration_versions`, `day_rates` |
| Performance                  | `kpi_definitions`, `sale_financial_values` |
| Business Rules               | `readiness_requirements`, `kpi_targets` (sale-status transition rules are not modelled until `OD-15`) |
| Learning                     | `curricula`, `learning_modules`, `lessons`, `quizzes`, `assessments`, `roleplays`, `assignments`, `learning_progress`, `quiz_attempts`, `submissions`, `submission_feedback` |
| Readiness                    | `readiness_submissions`, `readiness_evidence`, `readiness_decisions` |
| Sync                         | `sync_receipts` |
| Audit                        | `audit_events` |
| Views                        | `sale_current_statuses` (read-only) |

### Deviations from the Suggested Inventory

| Suggested                         | Here                                       | Reason |
| --------------------------------- | ------------------------------------------ | ------ |
| `sale_statuses` under Field       | Under Commercial Configuration             | `AD-07`: Commercial Configuration owns status definitions. |
| `commercial_configurations` + `commercial_configuration_versions` | `commercial_configuration_versions` only | A parent row would hold nothing but the campaign; versions are keyed by campaign directly. |
| `day_rate_configurations`         | `day_rates`                                | Already effective-dated rows; no separate parent needed. |
| `kpi_configurations`              | `kpi_targets` (with `kind`)                | Targets and thresholds share a shape; owned by Business Rules. |
| `performance_results`             | Not created (`DB-09`)                      | Would encode the undecided formula/period (`OD-16`). |
| `feedback`                        | `submission_feedback`                      | Plural naming convention; feedback is per submission. |
| —                                 | `quiz_attempts`                            | Quiz attempts and results are existing concepts (02 A5) distinct from assessment/roleplay submissions. |
| —                                 | `role_perspectives`, `deployment_states`, `door_outcomes` | Lookup tables required by `DB-02`, `DB-07` and Section 6. |
| —                                 | `audit_events`                             | Required for readiness approval audit and important configuration changes. |

---

## 21. Prisma Mapping Considerations

| Topic                    | Guidance                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Models                   | One Prisma model per table, `PascalCase` singular, mapped with `@@map("snake_case_plural")`; fields `camelCase` with `@map("snake_case")`.   |
| UUIDs                    | `String @id @db.Uuid`. Server-generated: `@default(dbgenerated("gen_random_uuid()"))`. Client-generated Field IDs: no default.            |
| Timestamps               | `DateTime @db.Timestamptz(6)`. `createdAt @default(now())` on every model; `updatedAt @updatedAt` on every model that can be updated, including end-dating and archiving (Section 2). Append-only models have no `updatedAt`. |
| Money                    | `Decimal @db.Decimal(12, 2)`; currency `String @db.Char(3)`.                                                                                  |
| Enums                    | Prisma enums for fixed vocabularies: `ScopeType`, `PermissionAction`, `FunnelStage`, `KpiTargetKind`, `FinancialValueKind`, `LessonContentType`, `AssignmentReason`, `ReadinessDecision`, `SyncResult`. |
| Lookup tables            | Evolvable vocabularies (roles, perspectives, deployment states, door outcomes, sale statuses) are models with relations, not enums (`DB-02`). |
| Effective-dated config   | Insert-only models. Query "version in force at time T" as latest `effectiveFrom ≤ T`. No `effectiveTo` field (`DB-05`).                    |
| History tables           | Insert-only models; application code never issues updates or deletes for them.                                                             |
| Current sale status      | Database view `sale_current_statuses`, mapped as a Prisma `view` (preview feature) or queried via `$queryRaw`. Never a writable field.     |
| Features Prisma can't express | Partial unique indexes, `NULLS NOT DISTINCT`, check constraints, `citext`, views: added as raw SQL in the generated migration file (`prisma migrate dev --create-only`, then edit). |
| JSON                     | Use `Json` only for: `quizzes.content`, `assessments.content`, `quiz_attempts.answers/result`, `eod_records.content` (all ⚠ provisional) and `audit_events.details` (non-authoritative). Never for data that is queried, joined, calculated on or used as a source of truth. Replace with relational tables when the related OD is resolved. |
| Relations across modules | Prisma relations may span modules (one schema). Module boundaries are enforced in NestJS: a module's repository only queries its own tables; cross-module reads go through the owning module's service, or use ID-only references (`AD-23`). |
| Polymorphic links        | Explicit nullable FK columns plus check constraints (e.g. `assignments`, `notes`), not generic `subject_type/subject_id`, except in `audit_events`. |

---

## 22. Migration Strategy

Each step is one or more Prisma migrations, committed and applied in order to every environment (03 §9, §16).

| Step | Migration                                   | Contents                                                                                              |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Extensions and enums                        | `pgcrypto` (if needed for `gen_random_uuid()`), `citext`; all enums.                                  |
| 2    | Identity / access foundations               | `organizations`, `users`, `organizational_assignments`, `roles`, `role_assignments`, `perspectives`, `role_perspectives`, `scopes`, `permissions`, `permission_grants`. Seed roles, perspectives, role–perspective links and permissions (all organisation-independent). **No** grants. |
| 3    | Deployment                                  | `campaigns`, `territories`, `deployment_states` (seed `ACTIVE`), `deployments`.                      |
| 4    | Commercial configuration                    | `sale_statuses`, `commercial_configuration_versions`, `day_rates`.                                   |
| 5    | Performance definitions and business rules  | `kpi_definitions`, `kpi_targets`.                                                                    |
| 6    | Field                                       | `door_outcomes`, `door_activities`, `funnel_kpi_inputs`, `sales`, `sale_status_history`, `callbacks`, `notes`, `eod_records`; view `sale_current_statuses`. |
| 7    | Derived financial values                    | `sale_financial_values`.                                                                             |
| 8    | Learning                                    | `curricula`, `learning_modules`, `lessons`, `quizzes`, `assessments`, `roleplays`, `assignments`, `learning_progress`, `quiz_attempts`, `submissions`, `submission_feedback`. |
| 9    | Readiness                                   | `readiness_requirements`, `readiness_submissions`, `readiness_evidence`, `readiness_decisions`.     |
| 10   | Sync and audit                              | `sync_receipts`, `audit_events`.                                                                     |

Ordering follows foreign-key dependencies: commercial configuration and KPI definitions precede Field because Field rows reference them. Seed data that is organisation-independent (roles, perspectives, role–perspective links, permissions, `ACTIVE` state) is part of the migrations because code depends on it. Migrations are responsible for database **structure** and this organisation-independent seed data only. Business configuration (campaigns, outcomes, statuses, rates) is entered through the Admin experience, not migrations.

### Environment Bootstrap (not a migration)

Default permission grants cannot be seeded by migrations: a grant needs a scope, and a scope needs an organisation, which is environment-specific data. A separate environment/application bootstrap step runs once per environment after the migrations:

1. Create the organisation.
2. Create its organisation-level scope (`scope_type = ORGANIZATION`).
3. Create the default role-based permission grants for that scope (e.g. `readiness.approve` and `sale_status.update` for `MANAGING_DIRECTOR`, `AD-24`).
4. Provision the initial Managing Director (user, organisational assignment, role assignment). ⚠ How accounts are created and first accessed is unresolved (`OD-04`); this step follows whatever `OD-04` decides and, until then, is environment-specific.

The bootstrap is idempotent and version-controlled with the backend, but it is not part of the migration history.

---

## 23. Database Summary

- **Associate → Deployment:** a user's organisation membership and role history live in `organizational_assignments` and `role_assignments`. Once the latest `readiness_decisions` row for the Associate is `APPROVED`, the Managing Director creates `deployments` linking the Associate to a `campaign` and `territory`. Multiple deployments are not prevented.
- **Field execution:** each Field record (`door_activities`, `funnel_kpi_inputs`, `sales`, `callbacks`, `notes`, `eod_records`) is a separate row with a client-generated ID, tied to its organisation, a deployment and its recorder. Nothing is derived from anything else, and sales and callbacks are not linked to door activities (`OD-31`, `OD-01`).
- **Funnel / KPI / Sales:** KPI inputs reference `kpi_definitions` by ID; funnel stage lives on the definition. Sales carry no status or value columns; `sale_status_history` is authoritative and the current status is a view. An initial status is written only if configured, and allowed transitions are not modelled until `OD-15`.
- **Performance / profitability:** `sale_financial_values` stores predicted and Actual/Realised values with the exact `commercial_configuration_versions` row used; Performance writes them in response to in-process events from Field (`AD-25`). KPI results and profitability are computed on read from facts, effective-dated `day_rates` and `kpi_targets`. Configuration cannot be back-dated, so results are always reproducible, and the undecided formula (`OD-16`) is not baked in.
- **Access and bootstrap:** perspectives and permission grants are role-based (`AD-24`). Migrations create structure and organisation-independent seed data; the organisation, its scope, default grants and the initial Managing Director are created by a separate environment bootstrap (`OD-04`).
- **Learning / improvement:** Admin-managed content (`curricula` → `learning_modules` → `lessons`; `quizzes`, `assessments`, `roleplays`) is assigned through `assignments`, including improvement assignments (`OD-17`), with progress, attempts, submissions and feedback recorded per Associate.
- **Readiness:** `readiness_requirements` decide what counts; `readiness_submissions` and `readiness_evidence` reference learning records; `readiness_decisions` record the Managing Director's auditable decision.
- **Offline sync:** the device owns the five sync states; the server stores `sync_receipts` with a unique client operation ID, written in the same transaction as the business record, so repeated delivery is harmless.
- **Auditability and history:** status history, immutable configuration versions, role history, readiness decisions, sync receipts and a small `audit_events` table.
- **Extensibility:** evolvable vocabularies are lookup tables; scopes have a type; day rates, targets, outcomes and statuses carry optional dimensions; every area tied to an open decision is marked ⚠ and listed in Section 19 with its expected change.
