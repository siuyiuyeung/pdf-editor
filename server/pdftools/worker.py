import logging

from . import config


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    from redis import Redis
    from rq import Queue, Worker

    redis = Redis.from_url(config.REDIS_URL)
    Worker([Queue(config.QUEUE_NAME, connection=redis)], connection=redis).work()


if __name__ == "__main__":
    main()
