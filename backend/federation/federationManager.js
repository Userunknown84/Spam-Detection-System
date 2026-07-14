/**
 * CyberDART - Collaborative Spam Detection Federation
 * Enables organizations to share anonymized threat intelligence
 */

const crypto = require('crypto');
const axios = require('axios');
const {
  FEDERATION_CONFIG,
  getMinMembersForConsensus,
  getThreatTTL,
  getSyncInterval,
  getMaxThreatsPerShare,
  getConfig,
  getFederationStatus
} = require('../config/federationConfig');

class FederationManager {
    constructor(options = {}) {
        this.members = new Map();
        this.sharedThreats = [];
        this.threatCache = new Map();
        this.federationId = crypto.randomUUID();
        this.syncTimers = [];
        this.isRunning = false;
        
        this.config = {
            minMembersForConsensus: options.minMembersForConsensus || getMinMembersForConsensus(),
            threatTTL: options.threatTTL || getThreatTTL(),
            syncInterval: options.syncInterval || getSyncInterval(),
            maxThreatsPerShare: options.maxThreatsPerShare || getMaxThreatsPerShare(),
            consensusTimeout: options.consensusTimeout || getConfig('consensusTimeout'),
            maxRetries: options.maxRetries || getConfig('maxRetries'),
            syncTimeout: options.syncTimeout || getConfig('syncTimeout'),
            maxSyncRetries: options.maxSyncRetries || getConfig('maxSyncRetries'),
            requestTimeout: options.requestTimeout || getConfig('requestTimeout'),
            maxPeers: options.maxPeers || getConfig('maxPeers'),
            heartbeatInterval: options.heartbeatInterval || getConfig('heartbeatInterval'),
            encryptionEnabled: options.encryptionEnabled !== undefined ? options.encryptionEnabled : getConfig('encryptionEnabled'),
            signatureRequired: options.signatureRequired !== undefined ? options.signatureRequired : getConfig('signatureRequired'),
            minTrustScore: options.minTrustScore || getConfig('minTrustScore'),
            maxHistorySize: options.maxHistorySize || getConfig('maxHistorySize')
        };
    }

    registerMember(memberData) {
        const { orgId, orgName, endpoint, publicKey, trustScore = 50 } = memberData;
        
        if (!orgId || !orgName || !endpoint || !publicKey) {
            throw new Error('Missing required member data');
        }

        if (this.members.size >= this.config.maxPeers) {
            throw new Error(`Maximum peers (${this.config.maxPeers}) reached`);
        }

        const member = {
            orgId,
            orgName,
            endpoint,
            publicKey,
            trustScore,
            joinedAt: new Date().toISOString(),
            lastSync: null,
            threatsShared: 0,
            threatsReceived: 0,
            status: 'active'
        };

        this.members.set(orgId, member);
        this.scheduleSync(orgId);
        
        return member;
    }

    unregisterMember(orgId) {
        if (!this.members.has(orgId)) {
            throw new Error('Member not found');
        }
        this.members.delete(orgId);
        return { success: true };
    }

    async shareThreat(threatData) {
        const { text, label, confidence, sourceOrgId } = threatData;
        
        if (!text || !label) {
            throw new Error('Threat text and label required');
        }

        const anonymized = this.patchAnonymize(text);
        const threatHash = this.generateThreatHash(anonymized);

        const existing = this.sharedThreats.find(t => t.hash === threatHash);
        if (existing) {
            existing.occurrences += 1;
            existing.lastSeen = new Date().toISOString();
            return { shared: false, duplicate: true };
        }

        const threat = {
            id: crypto.randomUUID(),
            hash: threatHash,
            anonymizedText: anonymized,
            originalText: text.slice(0, 100),
            label,
            confidence,
            sourceOrgId,
            occurrences: 1,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            verified: false,
            verificationCount: 0,
            ttl: this.config.threatTTL
        };

        this.sharedThreats.push(threat);
        await this.broadcastThreat(threat);

        const member = this.members.get(sourceOrgId);
        if (member) {
            member.threatsShared += 1;
        }

        return { shared: true, threatId: threat.id };
    }

    patchAnonymize(text) {
        let anonymized = text
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
            .replace(/\bhttps?:\/\/[^\s]+\b/g, '[URL]')
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

        anonymized = anonymized.toLowerCase();

        const stopWords = new Set(['the', 'a', 'an', 'of', 'for', 'on', 'at', 'to', 'in', 'is', 'it', 'and', 'or', 'but', 'with', 'from', 'by', 'as', 'was', 'are', 'were', 'been']);
        anonymized = anonymized.split(' ')
            .filter(word => !stopWords.has(word))
            .join(' ');

        const words = anonymized.split(' ');
        if (words.length > 3) {
            const replaceCount = Math.max(1, Math.floor(words.length * 0.05));
            for (let i = 0; i < replaceCount; i++) {
                const idx = Math.floor(Math.random() * words.length);
                words[idx] = '[REDACTED]';
            }
        }

        return words.join(' ');
    }

    generateThreatHash(text) {
        return crypto
            .createHash('sha256')
            .update(text)
            .digest('hex')
            .slice(0, 16);
    }

    async broadcastThreat(threat) {
        const broadcastPromises = [];
        
        for (const [orgId, member] of this.members) {
            if (orgId === threat.sourceOrgId) continue;
            
            const payload = {
                type: 'THREAT_SHARE',
                threatId: threat.id,
                hash: threat.hash,
                anonymizedText: threat.anonymizedText,
                label: threat.label,
                confidence: threat.confidence,
                timestamp: new Date().toISOString()
            };

            broadcastPromises.push(
                this.sendToMember(orgId, payload)
                    .catch(err => console.error(`Failed to send to ${orgId}:`, err))
            );
        }

        await Promise.allSettled(broadcastPromises);
    }

    async sendToMember(orgId, payload) {
        const member = this.members.get(orgId);
        if (!member) {
            throw new Error(`Member ${orgId} not found`);
        }

        const signature = crypto
            .createSign('sha256')
            .update(JSON.stringify(payload))
            .sign(process.env.FEDERATION_PRIVATE_KEY || 'default-key')
            .toString('base64');

        const response = await axios.post(
            `${member.endpoint}/api/federation/receive`,
            { ...payload, signature },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Federation-Id': this.federationId
                },
                timeout: this.config.requestTimeout
            }
        );

        if (member) {
            member.threatsReceived += 1;
            member.lastSync = new Date().toISOString();
        }

        return response.data;
    }

    async queryFederation(text) {
        const anonymized = this.patchAnonymize(text);
        const hash = this.generateThreatHash(anonymized);
        
        if (this.threatCache.has(hash)) {
            return this.threatCache.get(hash);
        }

        const queryPromises = [];
        for (const [orgId, member] of this.members) {
            queryPromises.push(
                this.queryMember(orgId, { hash })
                    .then(result => ({ orgId, result }))
                    .catch(() => ({ orgId, result: null }))
            );
        }

        const results = await Promise.allSettled(queryPromises);
        
        const threats = [];
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.result) {
                threats.push(r.value.result);
            }
        }

        if (threats.length > 0) {
            this.threatCache.set(hash, threats);
            setTimeout(() => this.threatCache.delete(hash), 60000);
        }

        return threats;
    }

    async queryMember(orgId, query) {
        const member = this.members.get(orgId);
        if (!member) {
            throw new Error(`Member ${orgId} not found`);
        }

        const response = await axios.post(
            `${member.endpoint}/api/federation/query`,
            query,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Federation-Id': this.federationId
                },
                timeout: this.config.requestTimeout
            }
        );

        return response.data;
    }

    getStats() {
        return {
            federationId: this.federationId,
            config: this.config,
            totalMembers: this.members.size,
            activeMembers: Array.from(this.members.values()).filter(m => m.status === 'active').length,
            totalThreats: this.sharedThreats.length,
            threatsLast24h: this.sharedThreats.filter(
                t => new Date(t.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
            ).length,
            members: Array.from(this.members.entries()).map(([id, m]) => ({
                id,
                name: m.orgName,
                trustScore: m.trustScore,
                threatsShared: m.threatsShared,
                threatsReceived: m.threatsReceived,
                status: m.status
            }))
        };
    }

    scheduleSync(orgId) {
        const timer = setInterval(async () => {
            try {
                const member = this.members.get(orgId);
                if (!member) return;

                const response = await this.queryMember(orgId, { sync: true });
                if (response.threats) {
                    for (const threat of response.threats) {
                        const existing = this.sharedThreats.find(t => t.hash === threat.hash);
                        if (!existing) {
                            this.sharedThreats.push({
                                ...threat,
                                receivedAt: new Date().toISOString()
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`Sync failed for ${orgId}:`, err);
            }
        }, this.config.syncInterval);
        
        this.syncTimers.push(timer);
    }

    verifyThreat(threatId) {
        const threat = this.sharedThreats.find(t => t.id === threatId);
        if (!threat) {
            throw new Error('Threat not found');
        }

        threat.verificationCount += 1;
        
        if (threat.verificationCount >= this.config.minMembersForConsensus) {
            threat.verified = true;
        }

        return threat;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        const syncTimer = setInterval(() => {
            this.performSync();
        }, this.config.syncInterval);
        this.syncTimers.push(syncTimer);

        const heartbeatTimer = setInterval(() => {
            this.sendHeartbeats();
        }, this.config.heartbeatInterval);
        this.syncTimers.push(heartbeatTimer);

        const pruneTimer = setInterval(() => {
            this.pruneThreats();
        }, getConfig('pruneInterval') || 24 * 60 * 60 * 1000);
        this.syncTimers.push(pruneTimer);
    }

    async performSync() {
        for (const [orgId] of this.members) {
            try {
                await this.scheduleSync(orgId);
            } catch (err) {
                console.error(`Sync error for ${orgId}:`, err);
            }
        }
    }

    async sendHeartbeats() {
        const heartbeat = {
            type: 'HEARTBEAT',
            federationId: this.federationId,
            timestamp: new Date().toISOString(),
            memberCount: this.members.size
        };

        for (const [orgId, member] of this.members) {
            try {
                await axios.post(
                    `${member.endpoint}/api/federation/heartbeat`,
                    heartbeat,
                    {
                        headers: { 'X-Federation-Id': this.federationId },
                        timeout: this.config.requestTimeout
                    }
                );
            } catch (err) {
                console.error(`Heartbeat failed for ${orgId}:`, err);
            }
        }
    }

    pruneThreats() {
        const now = Date.now();
        const retentionDays = getConfig('dataRetentionDays') || 30;
        const expiryTime = now - (retentionDays * 24 * 60 * 60 * 1000);

        this.sharedThreats = this.sharedThreats.filter(threat => {
            const threatTime = new Date(threat.createdAt).getTime();
            const isExpired = threatTime < expiryTime || now - threatTime > threat.ttl;
            return !isExpired;
        });
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;

        for (const timer of this.syncTimers) {
            clearInterval(timer);
        }
        this.syncTimers = [];
    }

    getFederationStatus() {
        return getFederationStatus();
    }

    getConfig(key) {
        return getConfig(key);
    }

    updateConfig(key, value) {
        const { updateConfig: updateConfigFn } = require('../config/federationConfig');
        const result = updateConfigFn(key, value);
        if (result) {
            this.config[key] = value;
        }
        return result;
    }
}

module.exports = FederationManager;