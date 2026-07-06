# mcpscaffold — developer tasks. Original Cognis Digital implementation.
.PHONY: install build test lint demo clean typecheck

install:
	npm ci || npm install

build:
	npm run build

typecheck:
	npm run typecheck

lint: typecheck

test:
	npm test

demo:
	npm run build
	node demos/validate_gate.mjs
	node demos/scaffold_and_smoke.mjs

clean:
	rm -rf dist dist-test node_modules
