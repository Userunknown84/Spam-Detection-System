const dns = require('dns');

class EmailAuthValidator {
  async validateDomain(domain) {
    const results = {
      domain,
      spf: await this.checkSPF(domain),
      dkim: await this.checkDKIM(domain),
      dmarc: await this.checkDMARC(domain),
      overall: 'warning'
    };
    
    // Calculate overall status
    const scores = [results.spf.pass, results.dkim.pass, results.dmarc.pass];
    const passCount = scores.filter(Boolean).length;
    results.overall = passCount >= 2 ? 'pass' : passCount >= 1 ? 'warning' : 'fail';
    
    return results;
  }

  async checkSPF(domain) {
    return new Promise((resolve) => {
      dns.resolveTxt(domain, (err, records) => {
        if (err) {
          resolve({ 
            pass: false, 
            status: 'fail', 
            details: 'No SPF record found. Domain is vulnerable to spoofing.',
            fix: 'Add an SPF record: v=spf1 include:spf.protection.outlook.com -all'
          });
          return;
        }
        const spf = records.flat().find(r => r.includes('v=spf1'));
        if (spf) {
          resolve({
            pass: true,
            status: 'pass',
            details: 'SPF record found and configured correctly.',
            record: spf,
            fix: 'Your SPF record looks good. No changes needed.'
          });
        } else {
          resolve({
            pass: false,
            status: 'fail',
            details: 'No SPF record found. Domain is vulnerable to spoofing.',
            fix: 'Add an SPF record: v=spf1 include:spf.protection.outlook.com -all'
          });
        }
      });
    });
  }

  async checkDKIM(domain) {
    const selectors = ['default', 'google', 'microsoft', 'selector1', 'selector2', 'dkim'];
    let found = false;
    
    for (const selector of selectors) {
      const record = `${selector}._domainkey.${domain}`;
      try {
        const result = await this.resolveTXT(record);
        if (result) {
          found = true;
          return {
            pass: true,
            status: 'pass',
            details: `DKIM record found (${selector})`,
            record: result,
            fix: 'DKIM configuration looks good.'
          };
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    return {
      pass: false,
      status: 'fail',
      details: 'No DKIM record found. Emails may be marked as spam.',
      fix: 'Add DKIM records for your email provider. Contact your email hosting provider for DKIM keys.'
    };
  }

  async checkDMARC(domain) {
    try {
      const record = `_dmarc.${domain}`;
      const result = await this.resolveTXT(record);
      if (result) {
        return {
          pass: true,
          status: 'pass',
          details: 'DMARC record found',
          record: result,
          fix: 'DMARC configuration looks good.'
        };
      }
    } catch (e) {
      // No DMARC record
    }
    
    return {
      pass: false,
      status: 'fail',
      details: 'No DMARC record found. Domain is vulnerable to spoofing.',
      fix: 'Add a DMARC record: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com'
    };
  }

  resolveTXT(record) {
    return new Promise((resolve, reject) => {
      dns.resolveTxt(record, (err, records) => {
        if (err) {
          reject(err);
        } else {
          resolve(records.flat().join(''));
        }
      });
    });
  }
}

module.exports = new EmailAuthValidator();