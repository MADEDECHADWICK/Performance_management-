# Non-Financial Performance Measurement System Implementation

## Overview

A comprehensive, data-driven Balanced Scorecard (BSC) framework has been implemented for audit and consulting firms. This system calculates objective non-financial performance scores from actual performance data rather than relying solely on subjective evaluations.

## Architecture

### Database Schema

#### New Tables Created

1. **training_records** - Track formal training completed by employees
   - Fields: employee_id, course_name, provider, hours, completed_at, certificate_url, training_type, status
   - Purpose: Learning & Growth KPI calculation (training hours)

2. **knowledge_sessions** - Track knowledge sharing presentations and events
   - Fields: presenter_id, title, topic_area, session_date, duration_hours, attendee_count, session_type, materials_url, feedback_score
   - Purpose: Learning & Growth KPI calculation (knowledge sharing)

3. **quality_reviews** - Manager/partner quality assessments of completed work
   - Fields: job_id, employee_id, reviewer_id, accuracy_score, completeness_score, timeliness_score, innovation_score, overall_score, feedback
   - Purpose: Internal Processes KPI calculation (quality metrics)

4. **improvement_ideas** - Process improvement suggestions from staff
   - Fields: submitted_by, title, description, category, priority, status, impact_area, estimated_savings, reviewed_by, reviewed_at, feedback
   - Purpose: Internal Processes KPI calculation (improvements implemented)

5. **employee_kpi_scores** - Aggregated KPI scores per employee per evaluation period
   - Fields: employee_id, evaluation_cycle_id, kpi_name, kpi_category, calculated_value, target_value, achievement_percentage, weight_percentage, weighted_score, calculation_period_start, calculation_period_end
   - Purpose: Audit trail and historical BSC score tracking

#### Enhanced Tables

1. **employee_evaluations** - Added BSC score fields
   - New fields:
     - bsc_learning_growth_score (Decimal)
     - bsc_customer_satisfaction_score (Decimal)
     - bsc_internal_processes_score (Decimal)

2. **work_logs** - Added activity type tracking
   - New field: activity_type (String) - 'mentoring', 'training', 'client_work', 'admin', etc.
   - Purpose: Track mentoring hours for Learning & Growth calculation

## Balanced Scorecard Framework

### Perspectives and Weightings

#### 1. Learning & Growth (35% of Non-Financial Score)

**Target**: Foster continuous development and knowledge sharing

**KPIs with Weights**:
- Training Hours (25% weight) - Target: 40 hours/year
- Certifications (20% weight) - Target: 1 per year
- Knowledge Sessions Led (20% weight) - Target: 4 sessions/year
- Mentoring Hours (20% weight) - Target: 20 hours/year
- Development Goals Completion (35% weight) - Target: 80%

**Score Calculation**:
```
trainingScore = (trainingHours / 40) × 100
certScore = min((certifications / 1) × 100, 100)
knowledgeScore = (knowledgeSessions / 4) × 100
mentoringScore = (mentoringHours / 20) × 100
developmentScore = (completedGoals / totalGoals) × 100

learningScore = (trainingScore × 0.20 + certScore × 0.20 + 
                knowledgeScore × 0.20 + mentoringScore × 0.20 + 
                developmentScore × 0.35)
```

#### 2. Customer Satisfaction (35% of Non-Financial Score)

**Target**: Deliver excellent client service and maintain strong relationships

**KPIs with Weights**:
- Client Feedback Rating (40% weight) - Target: 4.0/5.0
- On-Time Delivery (30% weight) - Target: 95%
- Client Retention Rate (30% weight) - Target: 85%

**Score Calculation**:
```
feedbackScore = (avgClientRating / 4.0) × 100
onTimeScore = (onTimeDeliveryRate / 95) × 100
retentionScore = (clientRetention / 85) × 100

customerScore = (feedbackScore × 0.40 + onTimeScore × 0.30 + 
                 retentionScore × 0.30)
```

#### 3. Internal Processes (30% of Non-Financial Score)

**Target**: Optimize operational efficiency and quality

**KPIs with Weights**:
- Quality Review Score (35% weight) - Target: 4.0/5.0
- Deadline Compliance (30% weight) - Target: 90%
- Peer Collaboration Rating (15% weight) - Target: 4.0/5.0
- Process Improvements Implemented (20% weight) - Target: 2/year

**Score Calculation**:
```
qualityScore = (avgQualityScore / 4.0) × 100
deadlineScore = (deadlineCompliance / 90) × 100
peerScore = (avgPeerRating / 4.0) × 100
improvementScore = (implementedIdeas / 2) × 100

processScore = (qualityScore × 0.35 + deadlineScore × 0.30 + 
                peerScore × 0.15 + improvementScore × 0.20)
```

#### Overall Non-Financial Score

```
overallScore = (learningScore × 0.35 + customerScore × 0.35 + 
                processScore × 0.30)
```

## Backend Implementation

### Service Layer: NonFinancialPerformanceService

**File**: `src/services/nonFinancialPerformance.service.ts`

**Key Methods**:

1. **calculateNonFinancialScores(employeeId, evaluationCycleId, periodStart, periodEnd)**
   - Calculates all three BSC category scores and overall score
   - Stores results in employee_kpi_scores table for audit trail
   - Returns BSCScores object with all scores

2. **getBSCBreakdown(employeeId, periodStart, periodEnd)**
   - Returns detailed breakdown with individual KPI values
   - Includes achievement percentages and weighted scores for each KPI
   - Useful for employee development conversations

3. **calculateLearningGrowthScore(employeeId, periodStart, periodEnd)**
   - Private method that calculates Learning & Growth category
   - Aggregates training records, knowledge sessions, mentoring hours, and development goals

4. **calculateCustomerSatisfactionScore(employeeId, periodStart, periodEnd)**
   - Private method that calculates Customer Satisfaction category
   - Aggregates client evaluations, on-time delivery metrics, and retention data

5. **calculateInternalProcessesScore(employeeId, periodStart, periodEnd)**
   - Private method that calculates Internal Processes category
   - Aggregates quality reviews, deadline compliance, peer evaluations, and improvement ideas

### API Routes

**File**: `src/routes/nonFinancialPerformance.ts`

#### Training Records Endpoints

```
POST   /non-financial-performance/training-records
       Create a new training record
       Body: { employee_id, course_name, provider, hours, completed_at, certificate_url, training_type }

GET    /non-financial-performance/training-records/:employeeId
       Get training records for an employee
       Query: ?periodStart=date&periodEnd=date

PUT    /non-financial-performance/training-records/:id
       Update a training record
       Body: { fields to update }
```

#### Knowledge Sessions Endpoints

```
POST   /non-financial-performance/knowledge-sessions
       Create a new knowledge session
       Body: { presenter_id, title, topic_area, session_date, duration_hours, attendee_count, session_type, materials_url }

GET    /non-financial-performance/knowledge-sessions/:presenterId
       Get knowledge sessions for a presenter
       Query: ?periodStart=date&periodEnd=date

PUT    /non-financial-performance/knowledge-sessions/:id
       Update a knowledge session
       Body: { fields to update }
```

#### Quality Reviews Endpoints

```
POST   /non-financial-performance/quality-reviews
       Create a quality review for completed work
       Body: { job_id, employee_id, reviewer_id, accuracy_score, completeness_score, timeliness_score, innovation_score, overall_score, feedback }

GET    /non-financial-performance/quality-reviews/:employeeId
       Get quality reviews for an employee
       Query: ?periodStart=date&periodEnd=date

PUT    /non-financial-performance/quality-reviews/:id
       Update a quality review
       Body: { fields to update }
```

#### Improvement Ideas Endpoints

```
POST   /non-financial-performance/improvement-ideas
       Submit a process improvement idea
       Body: { submitted_by, title, description, category, priority, impact_area, estimated_savings }

GET    /non-financial-performance/improvement-ideas
       Get all improvement ideas
       Query: ?status=pending&submitted_by=123&category=process

PUT    /non-financial-performance/improvement-ideas/:id
       Update improvement idea status
       Body: { status, feedback, reviewed_by }
```

#### Non-Financial Performance Scores Endpoints

```
GET    /non-financial-performance/non-financial-scores/:employeeId
       Calculate current non-financial scores
       Query: ?periodStart=date&periodEnd=date&evaluationCycleId=123
       Returns: { learningGrowthScore, customerSatisfactionScore, internalProcessesScore, overallNonFinancialScore }

GET    /non-financial-performance/non-financial-breakdown/:employeeId
       Get detailed BSC breakdown with all KPIs
       Query: ?periodStart=date&periodEnd=date
       Returns: Detailed breakdown with achievement percentages for each KPI

POST   /non-financial-performance/non-financial-scores/:evaluationId/update
       Update employee evaluation with calculated BSC scores
       Returns: { scores, evaluation }

GET    /non-financial-performance/kpi-scores/:employeeId
       Get stored KPI scores from history
       Query: ?evaluationCycleId=123

GET    /non-financial-performance/team-non-financial-scores/:managerId
       Get non-financial scores for entire team
       Query: ?periodStart=date&periodEnd=date
       Returns: Array of team member scores
```

## Data Flow

### Score Calculation Process

1. **Request received** → GET `/non-financial-performance/non-financial-scores/:employeeId`

2. **Service layer** → `calculateNonFinancialScores()` method:
   - Fetches training records from database
   - Aggregates knowledge sessions
   - Retrieves quality reviews
   - Calculates deadline compliance
   - Aggregates peer evaluations
   - Retrieves improvement ideas status

3. **Calculation** → Apply weighted formulas for each BSC category:
   - Learning & Growth = 35%
   - Customer Satisfaction = 35%
   - Internal Processes = 30%

4. **Storage** → Store calculated scores in `employee_kpi_scores` table for:
   - Audit trail
   - Historical tracking
   - Trend analysis
   - Performance appeals

5. **Response** → Return calculated scores to frontend

### Integration with Employee Evaluations

1. When creating/updating an employee evaluation, the system can:
   - Automatically calculate non-financial scores based on actual performance data
   - Populate BSC score fields (bsc_learning_growth_score, bsc_customer_satisfaction_score, bsc_internal_processes_score)
   - Allow managers to review and override with justification

2. Process:
   - Manager reviews calculated scores
   - Scores appear alongside subjective manager ratings
   - Manager can compare calculated vs manually-entered scores
   - Discrepancies are flagged for review

## Usage Examples

### Scenario 1: Calculate Annual Non-Financial Score

```javascript
// Get non-financial score for employee 42 for the year 2025
GET /non-financial-performance/non-financial-scores/42?periodStart=2025-01-01&periodEnd=2025-12-31

Response:
{
  "learningGrowthScore": 82.5,
  "customerSatisfactionScore": 78.3,
  "internalProcessesScore": 85.0,
  "overallNonFinancialScore": 81.9
}
```

### Scenario 2: Log Training Hours

```javascript
POST /non-financial-performance/training-records

Body:
{
  "employee_id": 42,
  "course_name": "Advanced Audit Standards",
  "provider": "AICPA",
  "hours": 16,
  "completed_at": "2025-06-15",
  "certificate_url": "https://...",
  "training_type": "external"
}
```

### Scenario 3: Submit Quality Review

```javascript
POST /non-financial-performance/quality-reviews

Body:
{
  "job_id": 15,
  "employee_id": 42,
  "reviewer_id": 8,
  "accuracy_score": 4.8,
  "completeness_score": 4.5,
  "timeliness_score": 4.9,
  "innovation_score": 4.2,
  "overall_score": 4.6,
  "feedback": "Excellent work with attention to detail. Minor suggestions for documentation."
}
```

### Scenario 4: Process Improvement Idea

```javascript
POST /non-financial-performance/improvement-ideas

Body:
{
  "submitted_by": 42,
  "title": "Automate Client Report Generation",
  "description": "Implement templated reports to reduce manual work...",
  "category": "process",
  "priority": "high",
  "impact_area": "Client Deliverables",
  "estimated_savings": 40
}
```

### Scenario 5: View Team Performance

```javascript
GET /non-financial-performance/team-non-financial-scores/8?periodStart=2025-01-01&periodEnd=2025-12-31

Response:
[
  {
    "employeeId": 42,
    "learningGrowthScore": 82.5,
    "customerSatisfactionScore": 78.3,
    "internalProcessesScore": 85.0,
    "overallNonFinancialScore": 81.9
  },
  {
    "employeeId": 43,
    "learningGrowthScore": 75.0,
    "customerSatisfactionScore": 82.1,
    "internalProcessesScore": 79.5,
    "overallNonFinancialScore": 78.9
  }
  // ... more team members
]
```

## Business Benefits

1. **Data-Driven Evaluations** - 15+ objective KPIs feed into performance scores
2. **Reduced Bias** - Scores calculated from actual behavior, not opinions
3. **Development Clarity** - Clear metrics show exactly how to improve
4. **Talent Decisions** - Objective data for promotion/compensation decisions
5. **Regulatory Compliance** - Comprehensive CPE tracking for audit firms
6. **Engagement** - Employees see transparent calculation of their scores
7. **Benchmarking** - Compare performance across departments and periods

## Future Enhancements

1. **Client Complaints Table** - Track formal complaints for customer satisfaction KPI
2. **Documentation Reviews** - Automated review of work paper completeness
3. **Advanced Analytics** - Trends, correlations, predictive modeling
4. **Mobile App** - Log training and improvements on-the-go
5. **Gamification** - Leaderboards, badges, achievement tracking
6. **Custom Targets** - Role-specific targets and weights
7. **Real-time Dashboards** - Live score updates throughout evaluation period
8. **API Integrations** - Connect with CPE providers, LMS, CRM systems

## Configuration and Customization

### Adjusting Targets

To modify KPI targets (e.g., training hours from 40 to 50), edit the `NonFinancialPerformanceService` class:

```typescript
// In calculateLearningGrowthKPIs()
const trainingKPI: KPIResult = {
  kpiName: 'training_hours',
  calculatedValue: trainingHours,
  targetValue: 50,  // Changed from 40
  achievementPercentage: Math.min(100, (trainingHours / 50) * 100),
  weightPercentage: 25,
  weightedScore: Math.min(25, (trainingHours / 50) * 25)
};
```

### Adjusting Weights

To modify category weights (e.g., increase Learning & Growth from 35% to 40%), edit the main score calculation:

```typescript
const overallNonFinancialScore = Math.min(100, 
  (learningGrowthScore * 0.40) +      // Changed from 0.35
  (customerSatisfactionScore * 0.35) + 
  (internalProcessesScore * 0.25)     // Changed from 0.30
);
```

## Maintenance and Monitoring

1. **Regular Score Audits** - Verify calculation accuracy quarterly
2. **Data Quality** - Ensure proper data entry (training hours, quality reviews)
3. **Performance Thresholds** - Monitor employee performance distribution
4. **System Updates** - Keep calculation logic aligned with business strategy
5. **Feedback Collection** - Gather feedback from managers and employees on usefulness

## Related Documentation

- [Prisma Schema](../prisma/schema.prisma) - Complete database schema
- [Employee Evaluations Routes](./employeeEvaluations.ts) - Integration with evaluation workflow
- [Balanced Scorecard Framework](../../DATA_STRUCTURE_SPECIFICATION.md) - High-level architecture

---

**Implementation Date**: January 9, 2026  
**Status**: Production Ready  
**Maintenance**: Ongoing
