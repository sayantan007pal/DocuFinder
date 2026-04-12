"""
src/api/routes/auth.py — JWT authentication + tenant registration.

RULE: tenant_id MUST come ONLY from decoded JWT.
      It is NEVER accepted from request body, query params, or headers.
"""
import re
from datetime import datetime, timedelta, timezone

import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator

from src.core.config import get_settings
from src.models.db import DocRecord, Tenant, User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SLUG_RE = re.compile(r"^[a-z0-9-]+$")


# ─── Request / Response Models ───────────────────────────────


class RegisterRequest(BaseModel):
    tenant_name: str
    tenant_slug: str
    email: EmailStr
    password: str

    @field_validator("tenant_slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only")
        if len(v) < 2 or len(v) > 50:
            raise ValueError("Slug must be 2–50 characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_slug: str
    user_id: str
    role: str


# ─── Helpers ─────────────────────────────────────────────────


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: User, tenant: Tenant) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role": user.role,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ─── Endpoints ───────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    """Register a new tenant + admin user. Returns JWT."""
    # Check slug uniqueness
    existing = await Tenant.find_one(Tenant.slug == body.tenant_slug)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant slug '{body.tenant_slug}' is already taken",
        )

    # Check email uniqueness (broad check — per-tenant uniqueness enforced at DB level)
    existing_email = await User.find_one(User.email == body.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Create Tenant
    tenant = Tenant(slug=body.tenant_slug, name=body.tenant_name)
    await tenant.insert()

    # Create User
    user = User(
        tenant_id=tenant.id,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    await user.insert()

    log.info("tenant_registered", tenant_slug=body.tenant_slug, email=body.email)

    return TokenResponse(
        access_token=create_access_token(user, tenant),
        tenant_slug=tenant.slug,
        user_id=str(user.id),
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """Authenticate user. Returns JWT."""
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    tenant = await Tenant.get(user.tenant_id)
    if not tenant or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant is deactivated",
        )

    log.info("user_login", email=body.email, tenant_slug=tenant.slug)

    return TokenResponse(
        access_token=create_access_token(user, tenant),
        tenant_slug=tenant.slug,
        user_id=str(user.id),
        role=user.role,
    )


# ─── Dependency ──────────────────────────────────────────────


async def get_current_user(
    authorization: str | None = None,
) -> tuple[User, str]:
    """
    FastAPI dependency: decode JWT → return (user, tenant_id_str).
    Raises HTTP 401 on missing / invalid / expired token.

    NOTE: Use as Depends() in routes:
        current_user = Depends(get_current_user_dep)
    """
    raise NotImplementedError("Use get_current_user_dep below")


from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user_dep(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> tuple[User, str]:
    """
    FastAPI dependency: validates Bearer JWT and returns (user, tenant_id_str).
    tenant_id comes from the JWT — never from user input.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    tenant_id: str | None = payload.get("tenant_id")

    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is malformed",
        )

    user = await User.get(PydanticObjectId(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return (user, tenant_id)
