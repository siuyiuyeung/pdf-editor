.PHONY: test test-unit test-e2e test-server test-e2e-server up down

test: test-unit test-server test-e2e test-e2e-server

test-unit:
	cd web && npm test

test-e2e:
	cd web && npx playwright test

# Server unit + integration tests inside the worker image (real LibreOffice, Ghostscript, pdf2docx).
test-server:
	docker build --target test -t pdftools-test ./server
	docker run --rm --init --network none pdftools-test

# Server-tool e2e against the full Compose stack; the rate limit is raised so the 3-browser run fits.
test-e2e-server:
	PDFTOOLS_RATE_LIMIT=1000 docker compose up -d --build
	cd web && npx playwright test -c playwright.server.config.ts; status=$$?; cd .. && docker compose down; exit $$status

up:
	docker compose up -d --build

down:
	docker compose down
