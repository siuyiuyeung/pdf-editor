.PHONY: test test-unit test-e2e up down

test: test-unit test-e2e

test-unit:
	cd web && npm test

test-e2e:
	cd web && npx playwright test

up:
	docker compose up -d --build

down:
	docker compose down
