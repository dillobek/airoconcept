from fastapi import APIRouter

from app.api.v1 import agent, api_keys, auth, conversations, leads

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(leads.router)
api_router.include_router(conversations.router)
api_router.include_router(api_keys.router)
api_router.include_router(agent.router)
