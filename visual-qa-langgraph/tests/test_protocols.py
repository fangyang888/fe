from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import httpx

from visual_qa_graph.protocols import DOCS_URL, lookup_protocols, protocol_cache_path, refresh_protocol_cache


WEB_ID = "63e4945e60ff2756af951db9"
LOGIN_ID = "63ec8db62efa9356b036b09f"
SHARE_ID = "63e4961260ff2756af951dc6"
OLD_ID = "5b4d42d88ec52f6ef1935022"
CURRENT_ID = "63e495d61b0fbd56b69e9575"
LEGACY_ID = "5b4d42d4fa8c206efd568d82"


def document(doc_id, category, name, path):
    return {"_id": doc_id, "category": category, "name": name,
            "mdContent": f"**路径：** `{path}`\n**调用方式：** `callNative`"}


class ProtocolLookupTests(unittest.TestCase):
    def setUp(self):
        self.cache_home = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch.dict("os.environ", {"XDG_CACHE_HOME": str(self.cache_home)}))
        self.cache = self.cache_home / "visual-qa-langgraph" / "uri-docs.json"
        self.docs = {
            WEB_ID: document(WEB_ID, CURRENT_ID, "web", "web"),
            LOGIN_ID: document(LOGIN_ID, CURRENT_ID, "登录", "login"),
            SHARE_ID: document(SHARE_ID, CURRENT_ID, "分享功能", "path"),
            OLD_ID: document(OLD_ID, LEGACY_ID, "登录", "login"),
        }
        self.requests = []
        self.available = True
        self.failed_id = None
        self.categories = [(LEGACY_ID, "旧路由", "2018-01-01"), (CURRENT_ID, "交互功能", "2023-02-09")]
        client_type = httpx.Client
        self.client_factory = self.enterContext(patch(
            "visual_qa_graph.protocols.httpx.Client",
            side_effect=lambda **options: client_type(transport=httpx.MockTransport(self.respond), **options),
        ))

    def respond(self, request):
        self.requests.append(request)
        if not self.available:
            return httpx.Response(503)
        endpoint = request.url.path.rsplit("/", 1)[-1]
        if endpoint == "get-categories":
            data = [
                {"_id": key, "name": name, "meta": {"createdAt": date}, "uri": [
                    {"id": doc_id, "name": doc["name"]} for doc_id, doc in self.docs.items() if doc["category"] == key
                ]}
                for key, name, date in self.categories
            ]
        else:
            self.assertEqual(endpoint, "get-uri")
            doc_id = request.url.params["docId"]
            if doc_id == self.failed_id:
                return httpx.Response(503)
            data = self.docs.get(doc_id)
        return httpx.Response(200, json={"success": True, "data": data})

    def test_first_webview_query_downloads_current_docs_and_keeps_results_compact(self):
        result = lookup_protocols(["打开新网页", "唤起App登录", "分享"])
        self.assertEqual(protocol_cache_path(), self.cache)
        self.assertEqual(result["source"], "network")
        self.assertEqual((result["scene"], result["sceneSource"], result["h5Fallback"]), ("webview", "default", False))
        web, login, share = result["results"]
        self.assertEqual((web["status"], web["path"], web["methods"]), ("matched", "web", ["callNative"]))
        self.assertEqual(login["document"]["url"], DOCS_URL + LOGIN_ID)
        self.assertEqual((result["status"], share["reason"]), ("needs_confirmation", "incomplete_contract"))
        self.assertNotIn("path", share)
        self.assertNotIn("referenceMarkdown", web["document"])
        self.assertTrue(self.cache.is_file())
        self.assertNotIn(OLD_ID, self.cache.read_text())
        self.assertNotIn(OLD_ID, [request.url.params.get("docId") for request in self.requests])

    def test_local_path_and_markdown_search_never_refresh_even_on_miss(self):
        self.docs[LOGIN_ID]["mdContent"] = self.docs[OLD_ID]["mdContent"] = document(
            LOGIN_ID, CURRENT_ID, "在线客服", "app/support",
        )["mdContent"] + "\n原生转人工"
        lookup_protocols()
        self.available = False
        result = lookup_protocols(["app/support", "原生转人工", "missing"], include_markdown=True)
        self.assertEqual(result["source"], "cache")
        self.assertEqual(result["results"][0]["document"]["docId"], LOGIN_ID)
        self.assertIn("原生转人工", result["results"][0]["document"]["referenceMarkdown"])
        self.assertEqual(result["results"][1]["candidates"][0]["docId"], LOGIN_ID)
        self.assertEqual(result["results"][2]["status"], "not_found")
        self.client_factory.assert_called_once()

    def test_direct_deprecated_document_is_absent_from_cache(self):
        result = lookup_protocols([DOCS_URL + OLD_ID], project_scene="webview")
        self.assertEqual(result["sceneSource"], "project")
        self.assertEqual(result["results"][0]["status"], "not_found")

    def test_h5_and_conflicting_config_skip_protocol_io(self):
        self.assertEqual(lookup_protocols(["web"], scene="h5")["results"], [])
        with self.assertRaisesRegex(ValueError, "conflicts"):
            lookup_protocols(["web"], scene="h5", project_scene="webview")
        with self.assertRaisesRegex(ValueError, "canonical"):
            lookup_protocols(["https://example.com/path"])
        self.client_factory.assert_not_called()
        self.assertFalse(self.cache.exists())

    def test_unavailable_document_server_keeps_webview_scene(self):
        self.available = False
        result = lookup_protocols(["web"])
        self.assertEqual((result["status"], result["scene"], result["h5Fallback"]),
                         ("unavailable", "webview", False))
        self.assertFalse(self.cache.exists())

    def test_explicit_refresh_replaces_snapshot_and_drops_removed_docs(self):
        lookup_protocols(["web"])
        del self.docs[WEB_ID]
        self.docs[LOGIN_ID]["mdContent"] = document(LOGIN_ID, CURRENT_ID, "登录", "account/login")["mdContent"]
        update = refresh_protocol_cache()
        self.assertEqual((update["status"], update["categoryCount"], update["protocolCount"]), ("ready", 1, 2))
        result = lookup_protocols(["web", "login"])
        self.assertEqual(result["results"][0]["status"], "not_found")
        self.assertEqual(result["results"][1]["path"], "account/login")
        self.assertEqual(self.client_factory.call_count, 2)

    def test_failed_detail_refresh_preserves_previous_snapshot(self):
        lookup_protocols()
        original = self.cache.read_bytes()
        self.failed_id = WEB_ID
        self.assertEqual(refresh_protocol_cache()["status"], "unavailable")
        self.assertEqual(self.cache.read_bytes(), original)
        self.assertEqual(lookup_protocols(["web"])["results"][0]["path"], "web")
        self.assertEqual(self.client_factory.call_count, 2)

    def test_corrupt_existing_cache_requires_manual_refresh(self):
        self.cache.parent.mkdir(parents=True)
        self.cache.write_text("{", encoding="utf-8")
        self.assertEqual(lookup_protocols(["web"])["status"], "unavailable")
        self.client_factory.assert_not_called()
        self.assertEqual(refresh_protocol_cache()["status"], "ready")
        self.assertEqual(lookup_protocols(["web"])["source"], "cache")
