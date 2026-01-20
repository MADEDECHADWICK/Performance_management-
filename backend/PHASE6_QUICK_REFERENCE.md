# Phase 6 Quick Reference Guide

## 🚀 Getting Started with Phase 6 Backend Features

### Server Startup
The server automatically initializes all Phase 6 features:

```bash
npm run dev
# ✅ Server running on http://localhost:4000
# 📡 WebSocket ready at ws://localhost:4000
```

---

## 📊 Using Real-Time Notifications (WebSocket)

### Connect to WebSocket
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Connection successful
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

### Listen to Events
```javascript
// Budget alerts
socket.on('budget:alert', (data) => {
  console.log('Budget Alert:', data);
  // { jobId, utilization, threshold, severity, message }
});

// Evaluation notifications
socket.on('evaluation:notification', (data) => {
  console.log('Evaluation:', data);
});

// Evaluation pending
socket.on('evaluation:pending', (data) => {
  console.log('Please submit evaluation:', data);
});

// Time entry status change
socket.on('timeEntry:statusChanged', (data) => {
  console.log('Time entry updated:', data);
});

// Job status change
socket.on('job:statusChanged', (data) => {
  console.log('Job updated:', data);
});

// Generic notification
socket.on('notification:new', (data) => {
  console.log('New notification:', data);
});
```

---

## 📄 Exporting Reports

### Budget Report as PDF
```bash
curl -X POST http://localhost:4000/api/phase6/reports/budget/pdf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"departmentId":"dept123","startDate":"2026-01-01","endDate":"2026-01-31"}'
```

### Budget Report as Excel
```bash
curl -X POST http://localhost:4000/api/phase6/reports/budget/excel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"departmentId":"dept123"}'
```

### Revenue Report as PDF
```bash
curl -X POST http://localhost:4000/api/phase6/reports/revenue/pdf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"jobId":"job123","startDate":"2026-01-01"}'
```

### Evaluations as CSV
```bash
curl -X GET "http://localhost:4000/api/phase6/reports/evaluations/csv?cycleId=cycle123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Broadcasting Budget Alerts

### Send Budget Alert to Specific User
```bash
curl -X POST http://localhost:4000/api/phase6/notifications/budget-alert \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "job123",
    "utilization": 85,
    "threshold": 80,
    "severity": "warning",
    "message": "Budget utilization exceeded 80%",
    "recipientIds": ["profile123", "profile456"]
  }'
```

### Send System Announcement
```bash
curl -X POST http://localhost:4000/api/phase6/notifications/announcement \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "System Maintenance",
    "message": "System will be down for maintenance",
    "priority": "high",
    "targetRoles": ["admin", "manager"]
  }'
```

---

## 🔄 Background Jobs

### Queue Report Generation
```bash
curl -X POST http://localhost:4000/api/phase6/jobs/queue/report \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "budget",
    "format": "pdf",
    "recipients": ["user@example.com", "admin@example.com"],
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  }'
```

### Get Job Queue Statistics
```bash
curl -X GET http://localhost:4000/api/phase6/jobs/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activeJobs": 5,
    "pendingJobs": 12,
    "failedJobs": 2,
    "completedJobs": 248
  }
}
```

---

## 📈 Analytics Endpoints

### Get KPI Trends
```bash
# Monthly trends for last 6 months
curl -X GET "http://localhost:4000/api/phase6/analytics/kpi-trends?period=monthly&months=6" \
  -H "Authorization: Bearer YOUR_TOKEN"

# By department
curl -X GET "http://localhost:4000/api/phase6/analytics/kpi-trends?period=quarterly&departmentId=dept123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Performance Comparison
```bash
curl -X GET "http://localhost:4000/api/phase6/analytics/performance-comparison?cycleId=cycle123&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cycleId": "cycle123",
    "totalEvaluations": 45,
    "averageScore": "3.8",
    "topPerformers": [
      { "rank": 1, "employeeName": "John Doe", "score": 4.8, "rating": "Excellent" }
    ],
    "needsImprovement": [
      { "rank": 45, "employeeName": "Jane Smith", "score": 2.1, "rating": "Unsatisfactory" }
    ]
  }
}
```

### Budget Variance Analysis
```bash
# Monthly variance analysis
curl -X GET "http://localhost:4000/api/phase6/analytics/budget-variance?period=monthly&threshold=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# By department
curl -X GET "http://localhost:4000/api/phase6/analytics/budget-variance?departmentId=dept123&period=quarterly" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Revenue Forecast
```bash
# 12-month forecast with 85% confidence
curl -X GET "http://localhost:4000/api/phase6/analytics/revenue-forecast?months=12&confidenceLevel=85" \
  -H "Authorization: Bearer YOUR_TOKEN"

# By department
curl -X GET "http://localhost:4000/api/phase6/analytics/revenue-forecast?months=6&confidenceLevel=90&departmentId=dept123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Dashboard

### Get Dashboard Metrics
```bash
curl -X GET http://localhost:4000/api/phase6/dashboard/metrics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "profile123",
    "userRole": "manager",
    "department": "Engineering",
    "budgetUtilization": "72.5",
    "monthlyRevenue": "45000.00",
    "pendingEvaluations": 3,
    "staffingUtilization": "95.0",
    "timestamp": "2026-01-20T10:30:00Z"
  }
}
```

### Get KPI Summary
```bash
curl -X GET http://localhost:4000/api/phase6/dashboard/kpi-summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 💾 Cache Management

### Clear Cache
```bash
# Clear all budget cache
curl -X POST http://localhost:4000/api/phase6/cache/clear \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "^budget:"}'

# Clear all cache
curl -X POST http://localhost:4000/api/phase6/cache/clear \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Cache Statistics
```bash
curl -X GET http://localhost:4000/api/phase6/cache/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hits": 1250,
    "misses": 450,
    "size": 125,
    "hitRate": "73.53%"
  }
}
```

---

## 🔐 Authentication

All Phase 6 endpoints require JWT Bearer token:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  http://localhost:4000/api/phase6/...
```

---

## 📋 Authorization Levels

| Feature | Admin | Manager | Finance | Analyst | Employee |
|---------|-------|---------|---------|---------|----------|
| Export Reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| Queue Jobs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Send Alerts | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅ | ✅ | ❌ |
| System Announcement | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dashboard Metrics | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cache Management | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🐛 Troubleshooting

### WebSocket Connection Issues
**Problem:** Connection refused
```
Solution: Ensure server is running and firewall allows WebSocket
- Check: http://localhost:4000/health
- Verify CORS_ORIGIN in .env
```

### Report Export Returns 403
**Problem:** Forbidden error
```
Solution: User must have admin, manager, or finance role
- Verify role_id in database
- Check Authorization header
```

### Cache Not Working
**Problem:** Cache hits not increasing
```
Solution: Check cache TTL settings and invalidation patterns
- GET /api/phase6/cache/stats to monitor
- Verify cache invalidation logic
```

---

## 📚 Integration Example

### React Component Example
```javascript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function DashboardComponent() {
  const [metrics, setMetrics] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Fetch metrics
    fetch('/api/phase6/dashboard/metrics', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => setMetrics(data.data));

    // Connect WebSocket
    const s = io('http://localhost:4000', { auth: { token } });
    s.on('budget:alert', (alert) => {
      console.log('Alert:', alert);
      // Update UI
    });
    setSocket(s);

    return () => s.disconnect();
  }, []);

  return (
    <div>
      <h2>Budget Utilization: {metrics?.budgetUtilization}%</h2>
      <h2>Monthly Revenue: ${metrics?.monthlyRevenue}</h2>
      <h2>Pending Evaluations: {metrics?.pendingEvaluations}</h2>
    </div>
  );
}
```

---

## 📞 Support

For issues or questions:
1. Check error logs: `npm run dev` console
2. Verify JWT token validity
3. Check user permissions/role
4. Review .env configuration

---

**Phase 6 Backend Features Ready! 🎉**
