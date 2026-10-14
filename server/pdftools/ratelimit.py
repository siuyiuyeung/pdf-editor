import time


class RateLimiter:
    """Fixed-window counter in Redis: at most `limit` calls per key per `window_s` seconds."""

    def __init__(self, redis, limit: int, window_s: int, prefix: str = "pdftools:rl:") -> None:
        self.redis = redis
        self.limit = limit
        self.window_s = window_s
        self.prefix = prefix

    def allow(self, key: str, now: float | None = None) -> bool:
        bucket = int((time.time() if now is None else now) // self.window_s)
        redis_key = f"{self.prefix}{key}:{bucket}"
        count = self.redis.incr(redis_key)
        if count == 1:
            self.redis.expire(redis_key, self.window_s)
        return count <= self.limit
