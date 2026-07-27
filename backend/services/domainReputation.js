const dns = require('dns');

class DomainReputationService {
  constructor() {
    this.dnsblServers = [
      'zen.spamhaus.org',
      'bl.spamcop.net',
      'dnsbl.sorbs.net'
    ];
  }

  async checkReputation(domain) {
    try {
      let listedCount = 0;
      
      for (const server of this.dnsblServers) {
        const query = `${domain}.${server}`;
        const result = await this.resolveDNS(query);
        if (result) listedCount++;
      }
      
      const score = Math.min((listedCount / this.dnsblServers.length) * 100, 100);
      
      return {
        domain,
        score,
        isSuspicious: score > 50,
        listedIn: listedCount > 0 ? `${listedCount} DNSBLs` : 'None'
      };
    } catch (error) {
      return { domain, score: 0, isSuspicious: false, error: error.message };
    }
  }

  resolveDNS(query) {
    return new Promise((resolve) => {
      dns.resolve(query, 'A', (err, addresses) => {
        resolve(err ? null : addresses);
      });
    });
  }
}

module.exports = new DomainReputationService();