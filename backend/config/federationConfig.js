const FEDERATION_CONFIG = {
  minMembersForConsensus: parseInt(process.env.FEDERATION_MIN_MEMBERS) || 3,
  consensusTimeout: parseInt(process.env.FEDERATION_CONSENSUS_TIMEOUT) || 30000,
  maxRetries: parseInt(process.env.FEDERATION_MAX_RETRIES) || 3,
  threatTTL: parseInt(process.env.FEDERATION_THREAT_TTL) || 7 * 24 * 60 * 60 * 1000,
  maxThreatsPerShare: parseInt(process.env.FEDERATION_MAX_THREATS_PER_SHARE) || 100,
  threatBatchSize: parseInt(process.env.FEDERATION_THREAT_BATCH_SIZE) || 50,
  syncInterval: parseInt(process.env.FEDERATION_SYNC_INTERVAL) || 60 * 60 * 1000,
  syncTimeout: parseInt(process.env.FEDERATION_SYNC_TIMEOUT) || 60000,
  maxSyncRetries: parseInt(process.env.FEDERATION_MAX_SYNC_RETRIES) || 3,
  syncBatchSize: parseInt(process.env.FEDERATION_SYNC_BATCH_SIZE) || 50,
  requestTimeout: parseInt(process.env.FEDERATION_REQUEST_TIMEOUT) || 10000,
  maxPeers: parseInt(process.env.FEDERATION_MAX_PEERS) || 20,
  heartbeatInterval: parseInt(process.env.FEDERATION_HEARTBEAT_INTERVAL) || 30000,
  peerTimeout: parseInt(process.env.FEDERATION_PEER_TIMEOUT) || 120000,
  encryptionEnabled: process.env.FEDERATION_ENCRYPTION_ENABLED !== 'false',
  signatureRequired: process.env.FEDERATION_SIGNATURE_REQUIRED !== 'false',
  minTrustScore: parseInt(process.env.FEDERATION_MIN_TRUST_SCORE) || 50,
  maxHistorySize: parseInt(process.env.FEDERATION_MAX_HISTORY_SIZE) || 1000,
  pruneInterval: parseInt(process.env.FEDERATION_PRUNE_INTERVAL) || 24 * 60 * 60 * 1000,
  dataRetentionDays: parseInt(process.env.FEDERATION_DATA_RETENTION_DAYS) || 30
};

function getMinMembersForConsensus() {
  return FEDERATION_CONFIG.minMembersForConsensus;
}

function getThreatTTL() {
  return FEDERATION_CONFIG.threatTTL;
}

function getSyncInterval() {
  return FEDERATION_CONFIG.syncInterval;
}

function getMaxThreatsPerShare() {
  return FEDERATION_CONFIG.maxThreatsPerShare;
}

function getConfig(key) {
  return FEDERATION_CONFIG[key];
}

function updateConfig(key, value) {
  if (FEDERATION_CONFIG[key] !== undefined) {
    FEDERATION_CONFIG[key] = value;
    return true;
  }
  return false;
}

function getFederationStatus() {
  return {
    minMembers: FEDERATION_CONFIG.minMembersForConsensus,
    threatTTL: FEDERATION_CONFIG.threatTTL,
    syncInterval: FEDERATION_CONFIG.syncInterval,
    maxThreats: FEDERATION_CONFIG.maxThreatsPerShare,
    encryptionEnabled: FEDERATION_CONFIG.encryptionEnabled,
    signatureRequired: FEDERATION_CONFIG.signatureRequired
  };
}

module.exports = {
  FEDERATION_CONFIG,
  getMinMembersForConsensus,
  getThreatTTL,
  getSyncInterval,
  getMaxThreatsPerShare,
  getConfig,
  updateConfig,
  getFederationStatus
};