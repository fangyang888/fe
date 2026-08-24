from typing import Protocol, cast

from fastapi.testclient import TestClient

from python_agent.main import create_app


class JsonResponse(Protocol):
    status_code: int

    def json(self) -> object: ...


class GetClient(Protocol):
    def get(self, url: str) -> JsonResponse: ...


def test_health_returns_public_service_status() -> None:
    client = cast(GetClient, TestClient(create_app()))

    response = client.get("/api/agent/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "Python Agent",
        "environment": "development",
    }
