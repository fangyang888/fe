"""Streamable HTTP transport for the desktop design MCP servers."""

from __future__ import annotations

import json
import threading
from typing import Any, Self

import httpx


class McpClient:
    server_name: str
    send_initialized = True

    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self.http = httpx.Client(timeout=45, trust_env=False, headers={
            "Accept": "application/json, text/event-stream",
        })
        self.next_id = 1
        self.lock = threading.Lock()

    def __enter__(self) -> Self:
        try:
            result = self._rpc("initialize", {
                "protocolVersion": "2025-03-26", "capabilities": {},
                "clientInfo": {"name": "visual-qa-langgraph", "version": "0.1.0"},
            })
            if protocol := result.get("protocolVersion"):
                self.http.headers["MCP-Protocol-Version"] = protocol
            if self.send_initialized:
                with self.http.stream("POST", self.endpoint, json={
                    "jsonrpc": "2.0", "method": "notifications/initialized",
                }) as response:
                    response.raise_for_status()
        except BaseException:
            self.http.close()
            raise
        return self

    def __exit__(self, *_exc: object) -> None:
        self.http.close()

    def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            request_id = self.next_id
            self.next_id += 1
            with self.http.stream("POST", self.endpoint, json={
                "jsonrpc": "2.0", "id": request_id, "method": method, "params": params,
            }) as response:
                response.raise_for_status()
                if session_id := response.headers.get("Mcp-Session-Id"):
                    self.http.headers["Mcp-Session-Id"] = session_id
                if "text/event-stream" in response.headers.get("content-type", ""):
                    payload = self._event_response(response, request_id)
                else:
                    response.read()
                    payload = response.json()
            if not isinstance(payload, dict) or payload.get("id") != request_id:
                raise RuntimeError(f"{self.server_name} MCP returned no response for {method}")
            if payload.get("error"):
                raise RuntimeError(f"{self.server_name} MCP {method}: {payload['error']}")
            return payload.get("result") or {}

    @staticmethod
    def _event_response(response: httpx.Response, request_id: int) -> dict[str, Any] | None:
        data = []
        for line in response.iter_lines():
            if line.startswith("data:"):
                data.append(line[5:].removeprefix(" "))
            elif not line and data:
                message = json.loads("\n".join(data))
                if isinstance(message, dict) and message.get("id") == request_id:
                    return message
                data.clear()
        if data:
            message = json.loads("\n".join(data))
            if isinstance(message, dict) and message.get("id") == request_id:
                return message
        return None

    def call(self, name: str, args: dict[str, Any]) -> list[dict[str, Any]]:
        result = self._rpc("tools/call", {"name": name, "arguments": args})
        if result.get("isError"):
            message = next((part.get("text", "") for part in result.get("content", []) if part.get("type") == "text"), "")
            raise RuntimeError(f"{self.server_name} {name}: {message[:500]}")
        return result.get("content") or []
