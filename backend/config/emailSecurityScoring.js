const EMAIL_SECURITY_SCORING = {
  checks: {
    spf: {
      pass: 100,
      fail: 0,
      error: 50,
      unknown: 50,
      missing: 0,
      description: 'SPF (Sender Policy Framework) check'
    },
    dkim: {
      pass: 100,
      fail: 0,
      missing: 0,
      error: 50,
      unknown: 50,
      description: 'DKIM (DomainKeys Identified Mail) check'
    },
    dmarc: {
      pass: 100,
      fail: 0,
      error: 50,
      unknown: 50,
      missing: 0,
      description: 'DMARC (Domain-based Message Authentication) check'
    },
    reply_to: {
      pass: 100,
      suspicious: 0,
      missing: 50,
      unknown: 50,
      description: 'Reply-To header check'
    },
    return_path: {
      pass: 100,
      suspicious: 25,
      missing: 50,
      unknown: 50,
      description: 'Return-Path header check'
    },
    from: {
      pass: 100,
      suspicious: 25,
      missing: 50,
      unknown: 50,
      description: 'From header check'
    },
    subject: {
      pass: 100,
      suspicious: 25,
      missing: 50,
      unknown: 50,
      description: 'Subject header check'
    }
  },
  thresholds: {
    highRisk: 50,
    mediumRisk: 70,
    lowRisk: 85,
    excellent: 95
  },
  weights: {
    spf: 1.0,
    dkim: 1.0,
    dmarc: 1.2,
    reply_to: 0.8,
    return_path: 0.8,
    from: 0.9,
    subject: 0.7
  },
  riskLevels: {
    critical: { min: 0, max: 30, label: 'Critical Risk', color: '#dc3545' },
    high: { min: 31, max: 50, label: 'High Risk', color: '#fd7e14' },
    medium: { min: 51, max: 70, label: 'Medium Risk', color: '#ffc107' },
    low: { min: 71, max: 85, label: 'Low Risk', color: '#28a745' },
    safe: { min: 86, max: 100, label: 'Safe', color: '#20c997' }
  }
};

function getCheckScore(checkName, result) {
  const check = EMAIL_SECURITY_SCORING.checks[checkName];
  if (!check) return 0;
  return check[result] || 0;
}

function getRiskLevel(score) {
  const levels = EMAIL_SECURITY_SCORING.riskLevels;
  for (const [key, level] of Object.entries(levels)) {
    if (score >= level.min && score <= level.max) {
      return {
        level: key,
        label: level.label,
        color: level.color
      };
    }
  }
  return {
    level: 'unknown',
    label: 'Unknown',
    color: '#6c757d'
  };
}

function getThreshold(type) {
  return EMAIL_SECURITY_SCORING.thresholds[type] || 70;
}

function getWeight(checkName) {
  return EMAIL_SECURITY_SCORING.weights[checkName] || 1.0;
}

function getCheckDescription(checkName) {
  const check = EMAIL_SECURITY_SCORING.checks[checkName];
  return check ? check.description : '';
}

module.exports = {
  EMAIL_SECURITY_SCORING,
  getCheckScore,
  getRiskLevel,
  getThreshold,
  getWeight,
  getCheckDescription
};