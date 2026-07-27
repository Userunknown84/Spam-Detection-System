const { CircuitBreaker } = require('../utils/circuitBreaker');

describe('CircuitBreaker', () => {
  let cb;
  
  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 100 });
  });

  it('starts in CLOSED state', () => {
    expect(cb.state).toBe('CLOSED');
  });

  it('calls requestFn successfully', async () => {
    const requestFn = jest.fn().mockResolvedValue('success');
    const fallbackFn = jest.fn();

    const result = await cb.fire(requestFn, fallbackFn);
    
    expect(result).toBe('success');
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(fallbackFn).not.toHaveBeenCalled();
  });

  it('transitions to OPEN state after failure threshold', async () => {
    const requestFn = jest.fn().mockRejectedValue(new Error('fail'));
    const fallbackFn = jest.fn().mockReturnValue('fallback');

    await cb.fire(requestFn, fallbackFn);
    await cb.fire(requestFn, fallbackFn);
    
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(2);
    
    const result3 = await cb.fire(requestFn, fallbackFn);
    expect(result3).toBe('fallback');
    expect(cb.state).toBe('OPEN');
    expect(cb.failureCount).toBe(3);
  });

  it('does not trigger fallback for 4xx errors', async () => {
    const error400 = new Error('Bad Request');
    error400.response = { status: 400 };
    const requestFn = jest.fn().mockRejectedValue(error400);
    const fallbackFn = jest.fn();

    await expect(cb.fire(requestFn, fallbackFn)).rejects.toThrow('Bad Request');
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
  });

  it('transitions to HALF-OPEN after timeout and then CLOSED on success', async () => {
    const requestFn = jest.fn().mockRejectedValue(new Error('fail'));
    const fallbackFn = jest.fn().mockReturnValue('fallback');

    // Trip the breaker
    await cb.fire(requestFn, fallbackFn);
    await cb.fire(requestFn, fallbackFn);
    await cb.fire(requestFn, fallbackFn);
    expect(cb.state).toBe('OPEN');

    // Next call immediately returns fallback
    requestFn.mockClear();
    await cb.fire(requestFn, fallbackFn);
    expect(requestFn).not.toHaveBeenCalled();

    // Wait for recovery timeout
    await new Promise(r => setTimeout(r, 110));

    // Next call should transition to HALF-OPEN and try requestFn
    requestFn.mockResolvedValue('success');
    const result = await cb.fire(requestFn, fallbackFn);
    
    expect(result).toBe('success');
    expect(cb.state).toBe('CLOSED');
    expect(cb.failureCount).toBe(0);
  });
});
