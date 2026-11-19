PYTHON ?= python3

.PHONY: build install update status remove build-antigravity install-antigravity update-antigravity status-antigravity remove-antigravity
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

build-antigravity:
	$(PYTHON) scripts/package_plugin.py --target antigravity

install-antigravity: build-antigravity
	$(PYTHON) build/antigravity-plugin.py install

update-antigravity: build-antigravity
	$(PYTHON) build/antigravity-plugin.py update

status-antigravity:
	$(PYTHON) build/antigravity-plugin.py status

remove-antigravity:
	$(PYTHON) build/antigravity-plugin.py remove
