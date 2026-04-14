"""
src/api/routes/chat.py — Chat session management endpoints
"""
from datetime import datetime
from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.api.routes.auth import get_current_user_dep
from src.models.db import ChatSession, ChatMessage, User

router = APIRouter(prefix="/chat", tags=["chat"])


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    doc_filter: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    is_active: Optional[bool] = None


class AddMessageRequest(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str
    citations: list[dict] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class SessionResponse(BaseModel):
    id: str
    title: str
    doc_filter: Optional[str]
    message_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: list[dict]
    metadata: dict
    created_at: datetime


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int


class MessagesResponse(BaseModel):
    messages: list[MessageResponse]
    total: int


# ─────────────────────────────────────────────────────────────────────────────
# Session Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """List all chat sessions for the current user."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    query = ChatSession.find(
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
        ChatSession.is_active == True,
    ).sort(-ChatSession.updated_at)
    
    total = await query.count()
    sessions = await query.skip(offset).limit(limit).to_list()
    
    return SessionListResponse(
        sessions=[
            SessionResponse(
                id=str(s.id),
                title=s.title,
                doc_filter=s.doc_filter,
                message_count=s.message_count,
                is_active=s.is_active,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in sessions
        ],
        total=total,
    )


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    req: CreateSessionRequest,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Create a new chat session."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    session = ChatSession(
        tenant_id=tid,
        user_id=uid,
        title=req.title or "New Chat",
        doc_filter=req.doc_filter,
    )
    await session.insert()
    
    return SessionResponse(
        id=str(session.id),
        title=session.title,
        doc_filter=session.doc_filter,
        message_count=session.message_count,
        is_active=session.is_active,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Get a specific chat session."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    session = await ChatSession.find_one(
        ChatSession.id == oid,
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        id=str(session.id),
        title=session.title,
        doc_filter=session.doc_filter,
        message_count=session.message_count,
        is_active=session.is_active,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Update a chat session (title, active status)."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    session = await ChatSession.find_one(
        ChatSession.id == oid,
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if req.title is not None:
        session.title = req.title
    if req.is_active is not None:
        session.is_active = req.is_active
    
    session.updated_at = datetime.utcnow()
    await session.save()
    
    return SessionResponse(
        id=str(session.id),
        title=session.title,
        doc_filter=session.doc_filter,
        message_count=session.message_count,
        is_active=session.is_active,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Delete a chat session and all its messages."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    session = await ChatSession.find_one(
        ChatSession.id == oid,
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Delete all messages in the session
    await ChatMessage.find(ChatMessage.session_id == oid).delete()
    
    # Delete the session
    await session.delete()


# ─────────────────────────────────────────────────────────────────────────────
# Message Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/messages", response_model=MessagesResponse)
async def list_messages(
    session_id: str,
    limit: int = 50,
    offset: int = 0,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Get all messages in a chat session."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    # Verify session exists and belongs to user
    session = await ChatSession.find_one(
        ChatSession.id == oid,
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    query = ChatMessage.find(
        ChatMessage.session_id == oid,
    ).sort(ChatMessage.created_at)
    
    total = await query.count()
    messages = await query.skip(offset).limit(limit).to_list()
    
    return MessagesResponse(
        messages=[
            MessageResponse(
                id=str(m.id),
                role=m.role,
                content=m.content,
                citations=m.citations,
                metadata=m.metadata,
                created_at=m.created_at,
            )
            for m in messages
        ],
        total=total,
    )


@router.post("/sessions/{session_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def add_message(
    session_id: str,
    req: AddMessageRequest,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Add a message to a chat session."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    uid = user.id
    
    try:
        oid = PydanticObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    
    # Verify session exists and belongs to user
    session = await ChatSession.find_one(
        ChatSession.id == oid,
        ChatSession.tenant_id == tid,
        ChatSession.user_id == uid,
    )
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    message = ChatMessage(
        session_id=oid,
        tenant_id=tid,
        user_id=uid,
        role=req.role,
        content=req.content,
        citations=req.citations,
        metadata=req.metadata,
    )
    await message.insert()
    
    # Update session
    session.message_count += 1
    session.updated_at = datetime.utcnow()
    
    # Auto-generate title from first user message
    if session.message_count == 1 and req.role == "user":
        session.title = req.content[:50] + ("..." if len(req.content) > 50 else "")
    
    await session.save()
    
    return MessageResponse(
        id=str(message.id),
        role=message.role,
        content=message.content,
        citations=message.citations,
        metadata=message.metadata,
        created_at=message.created_at,
    )
