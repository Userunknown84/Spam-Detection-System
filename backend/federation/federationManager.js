/**
 * CyberDART - Collaborative Spam Detection Federation
 * Enables organizations to share anonymized threat intelligence
 */

const crypto = require('crypto');
const axios = require('axios');
<<<<<<< Updated upstream
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
=======

class FederationManager {
    constructor() {
>>>>>>> Stashed changes
        this.members = new Map();
        this.sharedThreats = [];
        this.threatCache = new Map();
        this.federationId = crypto.randomUUID();
<<<<<<< Updated upstream
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

=======
        this.config = {
            minMembersForConsensus: 3,
            threatTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
            syncInterval: 60 * 60 * 1000, // 1 hour
            maxThreatsPerShare: 100
        };
    }

    /**
     * Register a new member in the federation
     */
>>>>>>> Stashed changes
    registerMember(memberData) {
        const { orgId, orgName, endpoint, publicKey, trustScore = 50 } = memberData;
        
        if (!orgId || !orgName || !endpoint || !publicKey) {
            throw new Error('Missing required member data');
        }

<<<<<<< Updated upstream
        if (this.members.size >= this.config.maxPeers) {
            throw new Error(`Maximum peers (${this.config.maxPeers}) reached`);
        }

=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
        
        // Start background sync
>>>>>>> Stashed changes
        this.scheduleSync(orgId);
        
        return member;
    }

<<<<<<< Updated upstream
=======
    /**
     * Remove a member from federation
     */
>>>>>>> Stashed changes
    unregisterMember(orgId) {
        if (!this.members.has(orgId)) {
            throw new Error('Member not found');
        }
        this.members.delete(orgId);
        return { success: true };
    }

<<<<<<< Updated upstream
    async shareThreat(threatData) {
        const { text, label, confidence, sourceOrgId } = threatData;
        
=======
    /**
     * Share a threat anonymously using PATCH algorithm
     */
    async shareThreat(threatData) {
        const { text, label, confidence, sourceOrgId } = threatData;
        
        // Validate
>>>>>>> Stashed changes
        if (!text || !label) {
            throw new Error('Threat text and label required');
        }

<<<<<<< Updated upstream
        const anonymized = this.patchAnonymize(text);
        const threatHash = this.generateThreatHash(anonymized);

        const existing = this.sharedThreats.find(t => t.hash === threatHash);
        if (existing) {
=======
        // Anonymize using PATCH algorithm
        const anonymized = this.patchAnonymize(text);
        
        // Calculate threat hash for deduplication
        const threatHash = this.generateThreatHash(anonymized);

        // Check if already exists
        const existing = this.sharedThreats.find(t => t.hash === threatHash);
        if (existing) {
            // Increment occurrence count
>>>>>>> Stashed changes
            existing.occurrences += 1;
            existing.lastSeen = new Date().toISOString();
            return { shared: false, duplicate: true };
        }

        const threat = {
            id: crypto.randomUUID(),
            hash: threatHash,
            anonymizedText: anonymized,
<<<<<<< Updated upstream
            originalText: text.slice(0, 100),
=======
            originalText: text.slice(0, 100), // Store preview for verification
>>>>>>> Stashed changes
            label,
            confidence,
            sourceOrgId,
            occurrences: 1,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            verified: false,
<<<<<<< Updated upstream
            verificationCount: 0,
            ttl: this.config.threatTTL
        };

        this.sharedThreats.push(threat);
        await this.broadcastThreat(threat);

=======
            verificationCount: 0
        };

        this.sharedThreats.push(threat);
        
        // Broadcast to all members
        await this.broadcastThreat(threat);

        // Update member stats
>>>>>>> Stashed changes
        const member = this.members.get(sourceOrgId);
        if (member) {
            member.threatsShared += 1;
        }

        return { shared: true, threatId: threat.id };
    }

<<<<<<< Updated upstream
    patchAnonymize(text) {
        let anonymized = text
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
            .replace(/\bhttps?:\/\/[^\s]+\b/g, '[URL]')
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

        anonymized = anonymized.toLowerCase();

=======
    /**
     * PATCH Anonymization Algorithm
     * Privacy-Preserving Anonymization for Collaborative Threat Sharing
     */
    patchAnonymize(text) {
        // Step 1: Remove personal identifiable information (PII)
        let anonymized = text
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]') // Phone numbers
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Emails
            .replace(/\bhttps?:\/\/[^\s]+\b/g, '[URL]') // URLs
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]'); // IP addresses

        // Step 2: Normalize case
        anonymized = anonymized.toLowerCase();

        // Step 3: Remove stop words (common words)
>>>>>>> Stashed changes
        const stopWords = new Set(['the', 'a', 'an', 'of', 'for', 'on', 'at', 'to', 'in', 'is', 'it', 'and', 'or', 'but', 'with', 'from', 'by', 'as', 'was', 'are', 'were', 'been']);
        anonymized = anonymized.split(' ')
            .filter(word => !stopWords.has(word))
            .join(' ');

<<<<<<< Updated upstream
        const words = anonymized.split(' ');
        if (words.length > 3) {
=======
        // Step 4: Apply differential privacy - add minimal noise
        // (This is a simplified version - real DP adds calibrated noise)
        const words = anonymized.split(' ');
        if (words.length > 3) {
            // Randomly replace 5% of words with placeholders
>>>>>>> Stashed changes
            const replaceCount = Math.max(1, Math.floor(words.length * 0.05));
            for (let i = 0; i < replaceCount; i++) {
                const idx = Math.floor(Math.random() * words.length);
                words[idx] = '[REDACTED]';
            }
        }

<<<<<<< Updated upstream
        return words.join(' ');
    }

=======
        // Step 5: Generate n-gram signature
        const result = words.join(' ');
        return result;
    }

    /**
     * Generate a unique hash for a threat
     */
>>>>>>> Stashed changes
    generateThreatHash(text) {
        return crypto
            .createHash('sha256')
            .update(text)
            .digest('hex')
            .slice(0, 16);
    }

<<<<<<< Updated upstream
=======
    /**
     * Broadcast threat to all federation members
     */
>>>>>>> Stashed changes
    async broadcastThreat(threat) {
        const broadcastPromises = [];
        
        for (const [orgId, member] of this.members) {
<<<<<<< Updated upstream
            if (orgId === threat.sourceOrgId) continue;
=======
            if (orgId === threat.sourceOrgId) continue; // Skip source
>>>>>>> Stashed changes
            
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

<<<<<<< Updated upstream
=======
    /**
     * Send data to a specific member
     */
>>>>>>> Stashed changes
    async sendToMember(orgId, payload) {
        const member = this.members.get(orgId);
        if (!member) {
            throw new Error(`Member ${orgId} not found`);
        }

<<<<<<< Updated upstream
=======
        // Add signature for verification
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
                timeout: this.config.requestTimeout
=======
                timeout: 10000
>>>>>>> Stashed changes
            }
        );

        if (member) {
            member.threatsReceived += 1;
            member.lastSync = new Date().toISOString();
        }

        return response.data;
    }

<<<<<<< Updated upstream
=======
    /**
     * Query federation for threats matching a text
     */
>>>>>>> Stashed changes
    async queryFederation(text) {
        const anonymized = this.patchAnonymize(text);
        const hash = this.generateThreatHash(anonymized);
        
<<<<<<< Updated upstream
=======
        // Check local cache first
>>>>>>> Stashed changes
        if (this.threatCache.has(hash)) {
            return this.threatCache.get(hash);
        }

<<<<<<< Updated upstream
=======
        // Query all members
>>>>>>> Stashed changes
        const queryPromises = [];
        for (const [orgId, member] of this.members) {
            queryPromises.push(
                this.queryMember(orgId, { hash })
                    .then(result => ({ orgId, result }))
                    .catch(() => ({ orgId, result: null }))
            );
        }

        const results = await Promise.allSettled(queryPromises);
        
<<<<<<< Updated upstream
=======
        // Aggregate results
>>>>>>> Stashed changes
        const threats = [];
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.result) {
                threats.push(r.value.result);
            }
        }

<<<<<<< Updated upstream
        if (threats.length > 0) {
            this.threatCache.set(hash, threats);
            setTimeout(() => this.threatCache.delete(hash), 60000);
=======
        // Cache results
        if (threats.length > 0) {
            this.threatCache.set(hash, threats);
            setTimeout(() => this.threatCache.delete(hash), 60000); // Cache for 1 minute
>>>>>>> Stashed changes
        }

        return threats;
    }

<<<<<<< Updated upstream
=======
    /**
     * Query a specific member
     */
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
                timeout: this.config.requestTimeout
=======
                timeout: 5000
>>>>>>> Stashed changes
            }
        );

        return response.data;
    }

<<<<<<< Updated upstream
    getStats() {
        return {
            federationId: this.federationId,
            config: this.config,
=======
    /**
     * Get federation statistics
     */
    getStats() {
        return {
            federationId: this.federationId,
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    scheduleSync(orgId) {
        const timer = setInterval(async () => {
=======
    /**
     * Schedule background sync with members
     */
    scheduleSync(orgId) {
        setInterval(async () => {
>>>>>>> Stashed changes
            try {
                const member = this.members.get(orgId);
                if (!member) return;

                const response = await this.queryMember(orgId, { sync: true });
<<<<<<< Updated upstream
=======
                // Process sync response
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        
        this.syncTimers.push(timer);
    }

=======
    }

    /**
     * Verify a threat (consensus-based)
     */
>>>>>>> Stashed changes
    verifyThreat(threatId) {
        const threat = this.sharedThreats.find(t => t.id === threatId);
        if (!threat) {
            throw new Error('Threat not found');
        }

        threat.verificationCount += 1;
        
<<<<<<< Updated upstream
        if (threat.verificationCount >= this.config.minMembersForConsensus) {
=======
        // 3 verifications = verified
        if (threat.verificationCount >= 3) {
>>>>>>> Stashed changes
            threat.verified = true;
        }

        return threat;
    }
<<<<<<< Updated upstream

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
=======
>>>>>>> Stashed changes
}

module.exports = FederationManager;