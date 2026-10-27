PYTHON ?= python3

.PHONY: build install update status remove
build:
	$(PYTHON) scripts/package_plugin.py

install: build
	$(PYTHON) build/codex-plugin.py install

update: build
	$(PYTHON) build/codex-plugin.py update

status:
	$(PYTHON) build/codex-plugin.py status

remove:
	$(PYTHON) build/codex-plugin.py remove
