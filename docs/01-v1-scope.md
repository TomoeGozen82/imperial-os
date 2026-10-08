# IMPERIAL OS — V1 Scope

> **Related:** [00 — Product Overview](./00-product-overview.md)
>
> This document defines the current V1 implementation boundary. Where it is more specific than the Product Overview, this document governs V1 scope.

---

## 1. V1 Objective

V1 exists to prove the **Core Operating Loops** of IMPERIAL OS.

### Success Condition

An already-recruited and client-authorised Associate can:

- enter IMPERIAL OS
- become Field Ready
- be deployed
- execute field activity
- record the necessary operational data
- have performance and profitability measured
- receive learning and roleplay for improvement
- repeat the operating loop reliably

### Outside the System

Recruitment, interviewing and client authorisation happen **outside** IMPERIAL OS and are **not** part of V1 scope.

---

## 2. Core Associate Journey

| #  | Step                                                          |
| -- | ------------------------------------------------------------- |
| 1  | Associate account exists                                      |
| 2  | Associate enters IMPERIAL OS                                  |
| 3  | Associate completes Field Readiness requirements              |
| 4  | Associate submits readiness for approval                      |
| 5  | Managing Director reviews readiness (approve or reject)       |
| 6  | Associate is approved as Field Ready                          |
| 7  | Associate receives Campaign and Territory                     |
| 8  | Associate completes campaign-specific learning/preparation    |
| 9  | Associate enters Field execution                              |
| 10 | Associate records field activity                              |
| 11 | Associate records door outcomes                               |
| 12 | Associate records funnel/KPI activity                         |
| 13 | Associate records sales                                       |
| 14 | Associate records callbacks                                   |
| 15 | Field data becomes available to Performance                   |
| 16 | Performance calculates KPIs                                   |
| 17 | System calculates Predicted Profitability                     |
| 18 | Sale status later determines Actual/Realised financial value  |
| 19 | System calculates Actual/Realised Profitability               |
| 20 | Learning / Roleplay / improvement work is assigned or surfaced |
| 21 | Associate applies the improvement                             |
| 22 | The operating loop repeats                                    |

---

## 3. V1 Mobile Application

The mobile application is the **primary operational experience for Associates**.

### Required Capabilities

**Identity and entry**

- [ ] Authentication
- [ ] Identity/profile
- [ ] Onboarding state
- [ ] Home / daily priorities

**Readiness and learning**

- [ ] Field Readiness
- [ ] Learning
- [ ] Assessments
- [ ] Roleplay
- [ ] Readiness status

**Deployment**

- [ ] Active Campaign
- [ ] Active Territory

**Field execution**

- [ ] Field execution
- [ ] Door activity
- [ ] Funnel/KPI inputs
- [ ] Sales
- [ ] Callbacks
- [ ] Notes where required
- [ ] Draft EOD reporting where practical

**Performance**

- [ ] Performance
- [ ] Predicted profitability
- [ ] Actual/realised profitability
- [ ] Improvement actions

**Offline**

- [ ] Offline Field execution
- [ ] Synchronization status

---

## 4. V1 Web / Admin Application

The web application is primarily the **management and business configuration experience**.

In V1, the Admin web application is used by the **Managing Director**.

> **Admin is not a role.** "Admin" refers to the management/configuration experience, not an organisational role. Do not introduce an `ADMIN` organisational role.

### Required Capabilities

**Organisation**

- [ ] Managing users
- [ ] Managing organisational assignments

**Learning and readiness**

- [ ] Managing learning content
- [ ] Managing curricula
- [ ] Managing assessments
- [ ] Managing roleplays
- [ ] Managing Field Readiness requirements
- [ ] Approving Field Readiness

**Deployment**

- [ ] Managing Campaigns
- [ ] Managing Territories
- [ ] Managing Deployments

**Commercial and performance configuration**

- [ ] Managing commercial configuration
- [ ] Managing sale statuses
- [ ] Managing day rates
- [ ] Managing KPI definitions
- [ ] Managing targets / thresholds
- [ ] Managing required V1 business rules

**Visibility**

- [ ] Viewing relevant operational/performance information

### Business Empowerment Requirement

The Admin application must provide sufficient Business Empowerment that **normal business configuration does not require developer changes**.

---

## 5. V1 Roles

| Role              | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| Junior Associate  | Operational Associate role. See differentiation rule below.                 |
| Associate         | Operational Associate role. See differentiation rule below.                 |
| Managing Director | Company-wide authorised visibility and management capabilities. Uses the Admin web application. |

These are the only V1 organisational roles. There is no separate Admin role and no separate Manager role in V1.

### Managing Director Responsibilities in V1

| Responsibility                  | Detail                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Field Readiness approval        | The Managing Director is the authorised approver. There is no delegated approval role.   |
| Sale status updates             | The Managing Director updates the underlying sale/business status.                       |

### Junior Associate vs Associate

Junior Associate and Associate should **not** have unnecessarily different technical permissions.

Their differences should primarily come from:

- status
- curriculum
- expectations
- targets
- commercial configuration
- progression

---

## 6. Permissions

### Concepts the System Must Distinguish

Identity, Role, Perspective, Scope and Permission are **distinct concepts** and must be kept separate.

| Concept     | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| Identity    | Who the user is.                                                                              |
| Role        | The user's organisational role (Junior Associate, Associate, Managing Director).              |
| Perspective | How the user is operating/viewing the system.                                                 |
| Scope       | The organisational/data boundary the user is authorised to operate within.                   |
| Permission  | What the user may do: View, Act or Approve.                                                   |

### Scope Model for V1

- Keep the scope model **simple and organisation-level** where possible.
- Design it so future scopes such as **region, area, campaign or territory** can be supported without redesign.
- Do **not** build a complex hierarchical scope system unless required by V1.

### Permission Types

| Permission | Supported in V1 |
| ---------- | --------------- |
| View       | Yes             |
| Act        | Yes             |
| Approve    | Yes             |

### Audit Requirement

Approvals must be **auditable**.

### Field Readiness Approval Flow

The Managing Director is the authorised approver for Field Readiness. There is no delegated approval role in V1.

1. Associate completes readiness
2. Associate submits readiness
3. Managing Director reviews
4. Managing Director approves or rejects

---

## 7. V1 Field Functionality

**Field is the source of truth for field activity.**

V1 Field execution must support:

- [ ] Viewing recently loaded deployment information
- [ ] Campaign
- [ ] Territory
- [ ] Recording doors
- [ ] Recording outcomes
- [ ] Recording funnel/KPI information
- [ ] Recording sales
- [ ] Recording callbacks
- [ ] Notes
- [ ] Draft EOD reporting where practical

---

## 8. V1 Offline Requirement

Offline support is required **specifically for business-critical Field execution**.

Offline Field functionality must allow the Associate to continue recording supported Field information without connectivity.

### Notes and EOD Offline

| Item          | Offline behaviour                                                                  |
| ------------- | ---------------------------------------------------------------------------------- |
| Notes         | Supported during offline Field execution.                                          |
| EOD reporting | Offline draft creation is supported where practical. Final server-side processing still requires synchronization. |

### Mobile Offline Obligations

The mobile application must:

- [ ] Store supported Field data safely on-device
- [ ] Queue records for synchronization
- [ ] Retry failed synchronization
- [ ] Protect against duplicate submissions
- [ ] Clearly show synchronization state

### Synchronization States

| State               |
| ------------------- |
| Saved locally       |
| Pending sync        |
| Syncing             |
| Successfully synced |
| Sync failed         |

### Submission Guarantee

The application must **never** claim that information was submitted to the server before the server has accepted it.

### Not Required Offline

The entire platform does **not** need to function offline. The following may require connectivity:

- Admin configuration
- advanced analytics
- company dashboards
- curriculum creation
- business rules configuration
- commercial configuration
- advanced mapping

---

## 9. V1 Performance

**Performance consumes Field data rather than duplicating Field input.**

V1 Performance must support:

- [ ] KPI records
- [ ] Funnel performance
- [ ] Performance history
- [ ] Relevant targets
- [ ] Performance analysis
- [ ] Predicted financial value
- [ ] Actual/realised financial value
- [ ] Predicted profitability
- [ ] Actual/realised profitability

### Standard V1 Funnel Stages

| Order | Stage                  |
| ----- | ---------------------- |
| 1     | Attention & Engagement |
| 2     | Problem Awareness      |
| 3     | Consequence Evaluation |
| 4     | Solution Alignment     |
| 5     | Close / Agreement      |

The funnel structure is **standardized**. Campaign-specific KPI definitions, targets and thresholds may be configurable around this structure.

### Funnel Integrity

The funnel stages must remain **logically valid**: later funnel-stage counts must **not exceed** earlier-stage counts.

---

## 10. V1 Profitability

The system must support **Predicted** and **Actual/Realised** Profitability.

### Sale Lifecycle

| Stage | What happens                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | A sale is recorded when the Associate obtains customer agreement or sign-up.                                                      |
| 2     | The system calculates predicted financial value from the applicable commercial configuration.                                     |
| 3     | The sale progresses through configurable statuses.                                                                                |
| 4     | When the configured financial confirmation state is reached, the system converts the financial value to Actual/Realised and recalculates profitability. |

### Status-Driven, Not Manually Entered

| Actor             | Responsibility                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| Associate         | Records sales.                                                                 |
| Managing Director | Updates the underlying sale/business status.                                   |
| System            | Recalculates predicted/actual financial values based on configured rules.      |

The Managing Director does **not** manually type resulting profit. There is no separate Manager role for this in V1.

### Commercial Configuration Must Support

- [ ] Campaign/client sale value
- [ ] Sale statuses
- [ ] Actual/realised status
- [ ] Expected processing/payment timeframe
- [ ] Associate day rate
- [ ] Effective dates for day-rate changes
- [ ] Campaign-specific differences

### Historical Accuracy

Historical profitability must **preserve the commercial configuration that applied at the relevant time**.

---

## 11. V1 Learning and Roleplay

Learning must be **data-driven** and **Admin-managed**.

V1 must support:

- [ ] Curricula
- [ ] Modules
- [ ] Lessons
- [ ] Written/video learning content
- [ ] Quizzes
- [ ] Assessments
- [ ] Roleplay
- [ ] Assignments
- [ ] Progress
- [ ] Readiness-related learning
- [ ] Campaign-specific learning where required

### V1 Learning Loop

1. Skill/learning assigned
2. Work completed
3. Roleplay/assessment submitted
4. Feedback
5. Improvement
6. Reassessment where required
7. Repeat

---

## 12. V1 Business Rules

Business rules should be represented in the **backend** in a way that allows the business to configure required V1 behaviour.

### Relevant V1 Rules

- [ ] Readiness requirements
- [ ] KPI targets
- [ ] KPI thresholds
- [ ] Callbacks *(detailed behaviour is an open business decision — see Section 16)*
- [ ] EOD deadlines *(detailed behaviour is an open business decision — see Section 16)*
- [ ] Approvals
- [ ] Operating thresholds
- [ ] Commercial rules
- [ ] Sale-status rules

### Constraint

Do **not** build a generic workflow/configuration engine unless it is required by the approved V1 functionality.

---

## 13. Explicitly Outside V1

Unless later approved, V1 does **not** include:

| Excluded capability                      |
| ---------------------------------------- |
| Advanced AI coaching                     |
| AI-generated learning                    |
| AI-generated reports                     |
| Sophisticated territory intelligence     |
| Route optimization                       |
| Interactive mapping                      |
| Advanced dashboard builder               |
| Extensive workflow automation            |
| External integrations                    |
| Voice logging                            |
| Predictive BI                            |
| Marketplace/API ecosystem                |
| Full leadership/growth loop              |
| Advanced recognition/progression system  |
| Complete future management-role experiences |

The architecture should **anticipate** these capabilities **without implementing** them now.

---

## 14. V1 Completion Test

V1 is complete **only** when the following scenario can be demonstrated end-to-end:

- [ ] An existing Associate enters IMPERIAL OS
- [ ] Completes and submits Field Readiness
- [ ] Managing Director reviews and approves readiness
- [ ] Becomes Field Ready
- [ ] Receives Campaign and Territory
- [ ] Completes required preparation
- [ ] Performs Field activity
- [ ] Records doors, funnel/KPI data, sales and callbacks
- [ ] Can continue supported Field work while offline, including notes and draft EOD reporting where practical
- [ ] Synchronizes safely after reconnecting, with final server-side EOD processing occurring after synchronization
- [ ] Sees Performance
- [ ] Sees Predicted Profitability
- [ ] Later sees Actual/Realised Profitability when the Managing Director updates the sale to the configured sale status
- [ ] Receives or is directed to Learning/Roleplay/Improvement work
- [ ] Completes that work
- [ ] Returns to Field execution
- [ ] Repeats the operating loop

---

## 15. Scope Rule

- Do **not** implement functionality merely because it appears in the broader IMPERIAL OS vision.
- The V1 operating loop and the requirements above define the **current implementation boundary**.
- If a requirement is unclear, contradictory or missing, **flag it for review** rather than inventing a rule.

---

## 16. Open Business Decisions

This section is the complete set of open V1 business decisions: the original decisions `OD-01`–`OD-03`, decisions `OD-04`–`OD-28` identified during user-journey mapping, and decisions `OD-29`–`OD-32` identified during domain modelling. Their exact behaviour is **currently unspecified** and requires business confirmation. Do not invent this behaviour during implementation.

| ID    | Area           | Known                                   | Requires confirmation                                                |
| ----- | -------------- | --------------------------------------- | -------------------------------------------------------------------- |
| OD-01 | Callbacks      | Callbacks are a V1 business rule category. | Triggering, due-date, escalation and overdue behaviour.           |
| OD-02 | EOD deadlines  | EOD deadlines are a V1 business rule category. | Triggering, due-date, escalation and overdue behaviour.       |
| OD-03 | Field Readiness rejection flow | The Managing Director can reject an Associate's Field Readiness. | The exact next-state behaviour after rejection (see below). |

### Field Readiness Rejection Flow

When the Managing Director rejects an Associate's Field Readiness, the exact next-state behaviour is **not yet defined**.

The following still require business confirmation:

- [ ] Whether the Associate receives feedback/reasons for rejection
- [ ] Whether incomplete requirements are identified
- [ ] Whether the Associate can correct the gaps
- [ ] Whether the Associate can resubmit
- [ ] Whether a new approval is required after resubmission

### Decisions Identified During User-Journey Mapping

The following gaps were identified while describing the V1 user journeys in [02 — User Journeys](./02-user-journeys.md). None of them should be resolved during implementation without business confirmation.

| ID    | Area                          | Undefined behaviour                                                                                         |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| OD-04 | Account creation / auth       | Who creates Associate accounts, how first access is issued, authentication method.                         |
| OD-05 | Onboarding                    | What induction and documentation consist of; whether onboarding is separate from Field Readiness.          |
| OD-06 | Readiness requirements        | Which requirement types exist, completion criteria, whether submission is blocked until complete.          |
| OD-07 | Assessments / quizzes         | Scoring, pass criteria, retake rules.                                                                       |
| OD-08 | Roleplay                      | Format, submission method, who provides feedback.                                                          |
| OD-09 | Learning progress             | Progress states and what counts as complete.                                                               |
| OD-10 | Campaign preparation gating   | Whether Field execution is blocked until required preparation is complete, or guided first.                |
| OD-11 | Deployment                    | Relationship to Campaign/Territory, states beyond "active", start/end, whether multiple can be active.     |
| OD-12 | Door outcomes                 | The set of outcomes and whether it is configurable.                                                        |
| OD-13 | Funnel recording              | Per-door vs aggregate recording; where funnel validity is enforced (device, server or both).               |
| OD-14 | Sale record                   | Required sale fields.                                                                                       |
| OD-15 | Sale status transitions       | Allowed transitions, reversals after Actual/Realised, non-realised end states.                             |
| OD-16 | Profitability calculation     | Formula and period; how day-rate cost and sale value combine; use of expected processing/payment timeframe. |
| OD-17 | Improvement identification    | Whether improvement work is assigned by the Managing Director, surfaced from thresholds, or both.          |
| OD-18 | Notifications / escalation    | Which events surface, remind, notify or escalate (Guide Before Enforce), and how.                          |
| OD-19 | Sync retry / rejection        | Automatic vs manual retry, frequency, handling of a record the server refuses.                             |
| OD-20 | Offline cache / session       | What "recently loaded" means; session/authentication expiry while offline.                                 |
| OD-21 | Editing Field records         | Whether and how records can be corrected after entry or after sync.                                        |
| OD-22 | EOD content / processing      | What an EOD report contains and what final server-side processing does.                                    |
| OD-23 | Required data                 | Which fields are mandatory per record type; behaviour when missing.                                        |
| OD-24 | Audit scope                   | Audit beyond approvals (e.g. sale status, configuration changes); how history is viewed.                   |
| OD-25 | Overview / Home contents      | Contents of Associate Home / daily priorities and Managing Director overview / monitoring.                 |
| OD-26 | Role progression              | How a Junior Associate progresses to Associate.                                                            |
| OD-27 | Unauthorized action           | User-facing response when an action is not permitted.                                                     |
| OD-28 | Configuration changes in flight | Effect of changing readiness, campaign or learning configuration on Associates already in progress or deployed. Commercial configuration is covered by the historical accuracy rule. |

### Decisions Identified During Domain Modelling

The following gaps were identified while defining the V1 domain model in [04 — Domain Model](./04-domain-model.md). None of them should be resolved during implementation without business confirmation.

| ID    | Area                          | Undefined behaviour                                                                                         |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| OD-29 | Associate day-rate level      | What level an Associate day rate is set at. Possible levels include per Associate, per role/status, per campaign, or a combination. The existing scope only establishes "Associate day rate" and "campaign-specific differences" without defining the ownership level. |
| OD-30 | Client entity                 | Whether "Client" is its own entity in V1. The existing documentation mentions campaign/client sale value and client authorisation, but does not establish whether Client is a separate domain entity from Campaign. |
| OD-31 | Close / Agreement, door outcome and Sale | Whether a Close / Agreement funnel count, a door outcome and a Sale can represent the same customer event, including whether these records should be linked, derived from one another, or independently recorded. |
| OD-32 | Junior Associate vs Associate status | What "status" means for Junior Associate versus Associate, including whether it represents progression within a role, a separate lifecycle/employment state, or another business concept. |
