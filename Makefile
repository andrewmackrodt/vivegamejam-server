SHELL=/bin/bash

.PHONY: build dist start clean

build:
	@docker build -f Dockerfile -t vivegamejam-server .

dist:
	@node_modules/.bin/tsc --sourcemap --outDir build/ ; \
	cp -r public build/ ; \
	cp package*.json build/ ; \
	( cd build/ && npm ci --only=prod )

start:
	@docker run --rm \
		-e PORT=8080 \
		-p 8080:8080 \
		vivegamejam-server

clean:
	@rm -rf build ; \
	docker rmi -f vivegamejam-server
