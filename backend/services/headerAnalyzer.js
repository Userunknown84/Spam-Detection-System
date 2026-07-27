class HeaderAnalyzer {
  analyzeHeaders(headers) {
    const results = {
      score: 0,
      issues: [],
      details: {}
    };

    // 1. Check Received headers (hop count)
    const receivedHeaders = headers.filter(h => h.toLowerCase().startsWith('received:'));
    if (receivedHeaders.length > 5) {
      results.score += 20;
      results.issues.push('Too many Received hops (possible relay)');
    }
    results.details.receivedCount = receivedHeaders.length;

    // 2. Check Message-ID
    const messageId = headers.find(h => h.toLowerCase().startsWith('message-id:'));
    if (!messageId) {
      results.score += 15;
      results.issues.push('Missing Message-ID header');
    } else if (!messageId.includes('@')) {
      results.score += 10;
      results.issues.push('Invalid Message-ID format');
    }

    // 3. Check Reply-To
    const replyTo = headers.find(h => h.toLowerCase().startsWith('reply-to:'));
    if (replyTo) {
      const from = headers.find(h => h.toLowerCase().startsWith('from:'));
      if (from && replyTo !== from) {
        results.score += 25;
        results.issues.push('Reply-To differs from From (phishing indicator)');
      }
    }

    // 4. Check Return-Path
    const returnPath = headers.find(h => h.toLowerCase().startsWith('return-path:'));
    const from = headers.find(h => h.toLowerCase().startsWith('from:'));
    if (returnPath && from) {
      const fromDomain = from.split('@')[1]?.replace('>', '');
      const returnDomain = returnPath.split('@')[1]?.replace('>', '');
      if (fromDomain && returnDomain && fromDomain !== returnDomain) {
        results.score += 30;
        results.issues.push('Return-Path domain mismatch');
      }
    }

    // 5. Check DKIM/SPF authentication results
    const authResults = headers.find(h => h.toLowerCase().includes('authentication-results:'));
    if (authResults) {
      if (authResults.includes('spf=fail') || authResults.includes('spf=softfail')) {
        results.score += 20;
        results.issues.push('SPF validation failed');
      }
      if (authResults.includes('dkim=fail')) {
        results.score += 20;
        results.issues.push('DKIM validation failed');
      }
    } else {
      results.score += 10;
      results.issues.push('No authentication results header');
    }

    // 6. Check for suspicious headers
    const suspiciousHeaders = ['x-mailer', 'x-priority', 'x-msmail-priority'];
    const found = suspiciousHeaders.filter(h => 
      headers.some(header => header.toLowerCase().startsWith(h))
    );
    if (found.length > 0) {
      results.details.suspiciousHeaders = found;
    }

    // Normalize score (0-100)
    results.score = Math.min(results.score, 100);
    results.isSpam = results.score > 50;

    return results;
  }

  parseHeaders(rawHeaders) {
    // Split by newline and parse key:value pairs
    const lines = rawHeaders.split('\n');
    const parsed = [];
    let currentKey = '';
    let currentValue = '';
    
    for (const line of lines) {
      if (line.match(/^\s/)) {
        // Continuation line
        currentValue += ' ' + line.trim();
      } else if (line.includes(':')) {
        // New header
        if (currentKey) {
          parsed.push(`${currentKey}: ${currentValue}`);
        }
        const [key, ...rest] = line.split(':');
        currentKey = key.trim();
        currentValue = rest.join(':').trim();
      }
    }
    if (currentKey) {
      parsed.push(`${currentKey}: ${currentValue}`);
    }
    
    return parsed;
  }
}

module.exports = new HeaderAnalyzer();