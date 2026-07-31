const Rule = require('../models/Rule');

async function applyRulesToEmails(userId, emails) {
 if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return { emails: emails || [], spamCount: 0, safeCount: 0 };
  }

  const rules = await Rule.find({ user: userId }).limit(1000).lean();

  const blacklist = new Set();
  const whitelist = new Set();

  rules.forEach(r => {
    if (!r.pattern) return;
    const pattern = r.pattern.toLowerCase().trim();
    if (r.type === 'blacklist') blacklist.add(pattern);
    else if (r.type === 'whitelist') whitelist.add(pattern);
  });

  let spamCount = 0;
  let safeCount = 0;

  const modifiedEmails = emails.map(email => {
    const sender = (email.sender || "").trim();
    if (!sender) {
      const isSpam = email.prediction && email.prediction.toLowerCase() !== 'ham' && email.prediction.toLowerCase() !== 'safe';
      if (isSpam) spamCount++;
      else safeCount++;
      return email;
    }

    // Parse sender (could be "John Doe <john@doe.com>" or just "john@doe.com")
    let emailAddress = sender;
    const emailMatch = sender.match(/<([^>]+)>/);
    if (emailMatch) {
      emailAddress = emailMatch[1];
    }
    emailAddress = emailAddress.toLowerCase().trim();

    const emailParts = emailAddress.split('@');
    const domain = emailParts.length > 1 ? emailParts[1] : '';

    const possiblePatterns = [emailAddress];
    if (domain) {
      possiblePatterns.push(`@${domain}`);
      possiblePatterns.push(domain);
    }

    let matchedType = null;
    for (const pattern of possiblePatterns) {
      if (blacklist.has(pattern)) {
        matchedType = 'blacklist';
        break;
      }
      if (whitelist.has(pattern)) {
        matchedType = 'whitelist';
        break;
      }
    }

    if (matchedType) {
      const isSpam = matchedType === 'blacklist';
      const updatedPrediction = isSpam ? 'spam' : 'ham';

      if (updatedPrediction === 'spam') {
        spamCount++;
      } else {
        safeCount++;
      }

      return {
        ...email,
        prediction: updatedPrediction,
        rule_applied: matchedType
      };
    }

    // If no rule matches, keep original prediction
    const isSpam = email.prediction && email.prediction.toLowerCase() !== 'ham' && email.prediction.toLowerCase() !== 'safe';
    if (isSpam) {
      spamCount++;
    } else {
      safeCount++;
    }

    return email;
  });

  return {
    emails: modifiedEmails,
    spamCount,
    safeCount
  };
}

module.exports = { applyRulesToEmails };