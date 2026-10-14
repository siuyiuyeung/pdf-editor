import fakeredis

from pdftools.ratelimit import RateLimiter


def test_allows_up_to_the_limit_per_key_and_window():
    limiter = RateLimiter(fakeredis.FakeRedis(), limit=3, window_s=600)
    assert [limiter.allow("1.2.3.4", now=1000) for _ in range(4)] == [True, True, True, False]
    assert limiter.allow("5.6.7.8", now=1000)
    assert limiter.allow("1.2.3.4", now=1000 + 600)


def test_window_keys_expire():
    redis = fakeredis.FakeRedis()
    RateLimiter(redis, limit=3, window_s=600).allow("k", now=0)
    [key] = redis.keys("*")
    assert 0 < redis.ttl(key) <= 600
