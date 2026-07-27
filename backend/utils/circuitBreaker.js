class CircuitBreaker {
  constructor(options = {}) {
    this.state = 'CLOSED';
    this.failureThreshold = options.failureThreshold || 3;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs || 10000;
    this.failureCount = 0;
    this.nextAttempt = 0;
  }

  async fire(requestFn, fallbackFn, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        console.log(`[CircuitBreaker] State transitioning from OPEN to HALF-OPEN`);
        this.state = 'HALF-OPEN';
      } else {
        return fallbackFn(new Error('Circuit breaker is OPEN'), ...args);
      }
    }

    try {
      const response = await requestFn(...args);
      this.onSuccess();
      return response;
    } catch (error) {
      // Don't trigger breaker for client errors (4xx)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }
      
      this.onFailure();
      return fallbackFn(error, ...args);
    }
  }

  onSuccess() {
    if (this.state !== 'CLOSED') {
      console.log(`[CircuitBreaker] State transitioning from ${this.state} to CLOSED`);
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF-OPEN') {
      if (this.state !== 'OPEN') {
        console.warn(`[CircuitBreaker] State transitioning from ${this.state} to OPEN due to failures`);
      }
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.recoveryTimeoutMs;
    }
  }
}

const mlCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  recoveryTimeoutMs: 15000 
});

module.exports = { CircuitBreaker, mlCircuitBreaker };
