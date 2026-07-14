const PREDICTION_TYPES = {
  SMS: 'sms',
  EMAIL: 'email',
  URL: 'url',
  MESSAGE: 'message',
  TWEET: 'tweet',
  COMMENT: 'comment',
  REVIEW: 'review'
};

const PREDICTION_TYPE_LIST = Object.values(PREDICTION_TYPES);

const PREDICTION_TYPE_LABELS = {
  [PREDICTION_TYPES.SMS]: 'SMS Message',
  [PREDICTION_TYPES.EMAIL]: 'Email Content',
  [PREDICTION_TYPES.URL]: 'URL Link',
  [PREDICTION_TYPES.MESSAGE]: 'Chat Message',
  [PREDICTION_TYPES.TWEET]: 'Tweet Text',
  [PREDICTION_TYPES.COMMENT]: 'Comment',
  [PREDICTION_TYPES.REVIEW]: 'Product Review'
};

const PREDICTION_TYPE_DESCRIPTIONS = {
  [PREDICTION_TYPES.SMS]: 'Short message service text for spam detection',
  [PREDICTION_TYPES.EMAIL]: 'Email content for spam detection',
  [PREDICTION_TYPES.URL]: 'URL link for malicious link detection',
  [PREDICTION_TYPES.MESSAGE]: 'Chat or instant message for spam detection',
  [PREDICTION_TYPES.TWEET]: 'Tweet text for spam detection',
  [PREDICTION_TYPES.COMMENT]: 'Comment text for spam detection',
  [PREDICTION_TYPES.REVIEW]: 'Product review for spam detection'
};

function isValidPredictionType(type) {
  return PREDICTION_TYPE_LIST.includes(type);
}

function getPredictionTypeLabel(type) {
  return PREDICTION_TYPE_LABELS[type] || type;
}

function getPredictionTypeDescription(type) {
  return PREDICTION_TYPE_DESCRIPTIONS[type] || '';
}

module.exports = {
  PREDICTION_TYPES,
  PREDICTION_TYPE_LIST,
  PREDICTION_TYPE_LABELS,
  PREDICTION_TYPE_DESCRIPTIONS,
  isValidPredictionType,
  getPredictionTypeLabel,
  getPredictionTypeDescription
};