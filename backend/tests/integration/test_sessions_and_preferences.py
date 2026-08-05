from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.mark.asyncio
async def test_user_preferences_crud():
    # 1. Get preferences (should return default empty)
    res = client.get("/api/preferences")
    assert res.status_code == 200
    data = res.json()
    assert "role_title" in data
    assert "interested_topics" in data
    assert "response_style" in data

    # 2. Update preferences
    update_payload = {
        "role_title": "Nhà đầu tư cá nhân",
        "interested_topics": "VNM, HPG, Vàng SJC",
        "response_style": "chi_tiet",
        "custom_instructions": "Trả lời súc tích và chính xác",
    }
    res_update = client.put("/api/preferences", json=update_payload)
    assert res_update.status_code == 200
    updated_data = res_update.json()
    assert updated_data["role_title"] == "Nhà đầu tư cá nhân"
    assert updated_data["interested_topics"] == "VNM, HPG, Vàng SJC"
    assert updated_data["response_style"] == "chi_tiet"


@pytest.mark.asyncio
async def test_chat_sessions_crud():
    # 1. Create a session
    res_create = client.post("/api/chat/sessions")
    assert res_create.status_code == 200
    session_data = res_create.json()
    session_id = session_data["id"]
    assert session_id is not None
    assert session_data["title"] == "Cuộc trò chuyện mới"

    # 2. List sessions
    res_list = client.get("/api/chat/sessions")
    assert res_list.status_code == 200
    sessions_list = res_list.json()
    assert any(s["id"] == session_id for s in sessions_list)

    # 3. Get session detail
    res_detail = client.get(f"/api/chat/sessions/{session_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == session_id
    assert detail["messages"] == []

    # 4. Delete session
    res_del = client.delete(f"/api/chat/sessions/{session_id}")
    assert res_del.status_code == 200

    # Verify session is deleted
    res_detail_deleted = client.get(f"/api/chat/sessions/{session_id}")
    assert res_detail_deleted.status_code == 404
