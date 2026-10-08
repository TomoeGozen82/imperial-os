# IMPERIAL OS — Product Overview

## 1. What IMPERIAL OS Is

IMPERIAL OS is the organisation's central Operating System.

It is **not** simply:

- a sales training application
- a KPI dashboard
- a CRM
- an internal communications tool

The purpose of IMPERIAL OS is to run and support the organisation's repeatable operating processes.

## 2. Organisational Operating Model

The broader organisational operating model is:

**Recruit → Train → Deploy → Measure → Improve → Develop Leaders → Replicate**

### Where IMPERIAL OS Begins

Recruitment itself happens **outside** IMPERIAL OS.

Once recruitment, interview and client authorisation are complete, IMPERIAL OS begins with:

- account creation
- onboarding
- induction
- documentation
- Field Sales readiness
- deployment

## 3. V1 Focus: The Core Operating Loops

The V1 focus is the Core Operating Loops:

1. Performance
2. Learning
3. Roleplay
4. Deployment / Field execution

### V1 Associate Journey

1. Enter IMPERIAL OS
2. Complete Field Readiness
3. Leader Approval
4. Field Ready
5. Campaign + Territory
6. Campaign-specific learning / preparation
7. Field execution
8. Manually record field activity, funnel/KPI activity, sales and callbacks
9. Performance consumes the recorded data
10. Measure performance and profitability
11. Identify improvement
12. Learning / Roleplay
13. Repeat

### Purpose of V1

V1 exists to prove that an already-recruited and authorised Associate can reliably progress through this operating loop.

## 4. Roles

### V1 Operational Roles

- Junior Associate
- Associate
- Managing Director

### Future Roles

- Senior Associate
- Area Sales Manager
- Regional Sales Manager

The platform should support future roles without requiring a redesign.

## 5. Product Principles

1. **Direction**
   The user should know what they need to do next.

2. **Performance**
   The user should know how they are performing, their profitability and where they can improve.

3. **Guide Before Enforce**
   The system should surface, remind, notify and escalate before restricting the user where appropriate.

4. **One Identity, Multiple Perspectives**
   The system should not create separate identities or separate applications for each organisational role.

5. **Improve, Don't Duplicate**
   IMPERIAL OS should not recreate client CRM/sales systems. It should capture the operational and coaching information necessary for the organisation.

6. **Build for Scale**
   The architecture should support future roles, locations, campaigns and organisational growth.

## 6. User Experiences

### Mobile (Associates and Field Execution)

The main user experience is **mobile-first** for Associates and field execution.

### Web (Admin / Managing Director)

The platform also has a web-based Admin / Managing Director experience for managing:

- the organisation
- learning
- campaigns
- territories
- deployments
- commercial configuration
- business rules
- other operational configuration

### One Platform

Both clients are part of one platform and use a shared backend.

## 7. Intended Architecture

| Layer                                | Technology                   |
| ------------------------------------ | ---------------------------- |
| Mobile                               | React Native + Expo          |
| Web                                  | Next.js                      |
| Backend                              | NestJS                       |
| Database                             | Managed PostgreSQL           |
| Development database infrastructure  | Supabase PostgreSQL          |
| ORM                                  | Prisma                       |
| Language                             | TypeScript                   |

The backend is the application's domain and business-logic boundary. Mobile and web should not duplicate important business logic.

## 8. Domain Ownership Principles

- **Identity** owns identity.
- **Learn** owns learning records.
- **Field** owns field activity.
- **Performance** owns KPI/performance calculations.
- **Business Rules** owns organisational logic.
- **Admin** configures the platform but does not replace the ownership of operational domains.

## 9. Business Configurability

V1 must support business configurability. Routine business changes should be manageable through the Admin experience rather than requiring developer changes.

Important configurable areas include:

- learning and curricula
- assessments and roleplays
- readiness requirements
- users and organisational assignments
- campaigns
- territories
- deployments
- commercial configuration
- sale values
- day rates
- sale statuses
- actual/realised profitability rules
- KPI definitions
- targets and thresholds
- operational business rules

## 10. Profitability

V1 must support both **predicted** and **actual/realised** profitability.

### Sale Lifecycle

1. A sale is recorded when the Associate obtains customer agreement/sign-up.
2. The system calculates predicted financial value from commercial configuration.
3. The sale then moves through configurable processing/status states.
4. When the configured financial confirmation state is reached, the financial value becomes Actual/Realised and profitability is recalculated.

### Effective Dates

Historical calculations must respect the effective dates of commercial configuration, such as Associate day rates.

## 11. Offline Field Execution

V1 requires offline support for business-critical Field execution.

### Offline Scope

Offline Field functionality should support, where practical:

- viewing recently loaded campaign/territory/deployment information
- recording doors and outcomes
- KPI inputs
- sales
- callbacks
- notes
- draft EOD reporting

Offline support is specifically for Field execution. The entire platform does not need to function offline.

### Local Storage and Queuing

Offline data must be safely stored locally and queued for synchronization.

### Synchronization States

Synchronization states must be explicit:

- Saved locally
- Pending sync
- Syncing
- Successfully synced
- Sync failed

### Synchronization Guarantees

- The application must never claim that information has been submitted to the server until the server has accepted it.
- The system must protect against duplicate submissions when connectivity returns.

## 12. V1 Scope and Deferred Features

V1 should prioritize proving the Core Operating Loops rather than implementing every future capability.

### Explicitly Deferred (Unless Later Approved)

- advanced AI coaching
- sophisticated territory intelligence
- route optimization
- interactive mapping
- advanced analytics
- extensive workflow automation
- external integrations
- full leadership/growth functionality
- advanced dashboard builder
- voice logging
- predictive BI
- marketplace/API ecosystem

### Build Philosophy

The product should be built as a strong, extensible V1 rather than over-engineered as a generic platform.
