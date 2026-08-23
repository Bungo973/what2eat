/** 简单令牌桶限流：内存实现，按身份（API token 哈希或 IP）隔离。 */
export class TokenBucket {
  private states = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  take(key: string, cost = 1): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now() / 1000;
    let state = this.states.get(key);
    if (!state) {
      state = { tokens: this.capacity, lastRefill: now };
      this.states.set(key, state);
    }
    const elapsed = now - state.lastRefill;
    state.tokens = Math.min(this.capacity, state.tokens + elapsed * this.refillPerSecond);
    state.lastRefill = now;
    if (state.tokens >= cost) {
      state.tokens -= cost;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const deficit = cost - state.tokens;
    return { allowed: false, retryAfterSeconds: Math.ceil(deficit / this.refillPerSecond) };
  }
}

/** 默认限流策略：全局调用 60/分钟；价格工具单独 12/分钟（PRD §12.3）。 */
export function defaultRateLimits(): { general: TokenBucket; price: TokenBucket } {
  return {
    general: new TokenBucket(60, 1),
    price: new TokenBucket(12, 0.2),
  };
}
