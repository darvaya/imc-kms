# Planned Maintenance System (PMS)

## Purpose

This document describes the Planned Maintenance System used to manage maintenance on IMC Pelita Logistik vessels.

---

## What is PMS?

The Planned Maintenance System is a systematic approach to maintenance that:
- Schedules maintenance activities in advance
- Tracks maintenance history
- Ensures regulatory compliance
- Prevents breakdowns through planned work

---

## PMS Components

| Component | Purpose |
|-----------|---------|
| **Equipment register** | List of all maintainable items |
| **Job cards** | Standard maintenance procedures |
| **Schedules** | When maintenance is due |
| **Work orders** | Assigned maintenance tasks |
| **History** | Record of completed work |
| **Spare parts** | Inventory management |

---

## Maintenance Types

| Type | Description | Trigger |
|------|-------------|---------|
| **Time-based** | Scheduled by calendar | Every X months |
| **Running hours** | Based on equipment hours | Every X hours |
| **Condition-based** | Based on condition monitoring | Per readings |
| **Corrective** | Breakdown repair | Failure |
| **Class-required** | Regulatory surveys | Per class schedule |

---

## PMS Workflow

```
┌─────────────────┐
│  JOB DUE        │  PMS generates alert
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WORK ORDER     │  Task assigned to crew
│  CREATED        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WORK           │  Maintenance performed
│  PERFORMED      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  COMPLETION     │  Record work, parts used
│  RECORDED       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HISTORY        │  Available for audits
│  UPDATED        │
└─────────────────┘
```

---

## Critical Equipment

The following equipment has enhanced PMS requirements:

| Equipment | Reason |
|-----------|--------|
| Main engine | Propulsion |
| Generators | Power |
| Steering gear | Navigation |
| Firefighting | Safety |
| Cranes (FLF) | Operations |
| Conveyor (FLF) | Operations |

---

## Responsibilities

| Role | Responsibility |
|------|----------------|
| **Chief Engineer** | Execute on-board maintenance |
| **Superintendent** | Monitor compliance, support |
| **Technical Manager** | Overall oversight |
| **Crew** | Perform assigned work |

---

## Spare Parts

| Principle | Details |
|-----------|---------|
| **Critical spares** | Maintain minimum stock |
| **Re-order level** | Trigger for reorder |
| **Lead time** | Plan for delivery time |
| **Quality** | Only approved parts |

---

## Reporting

| Report | Frequency | To |
|--------|-----------|-----|
| Overdue jobs | Weekly | Superintendent |
| Completion rate | Monthly | Technical Manager |
| Defect report | As needed | Superintendent |

---

## Audits

PMS records are subject to:
- Internal SMS audits
- ISM external audits
- Port State Control inspection
- Class surveys

> **Tip:** Keep records up to date – auditors will check!

---

## Related Documents

- [Dry Docking](./02-dry-docking.md)
- [Class Surveys](./03-class-surveys.md)
- [ISM Code Compliance](../../01-HSSE/02-safety-management-system/01-ism-code-compliance.md)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-02 | Technical Department | Initial release |
