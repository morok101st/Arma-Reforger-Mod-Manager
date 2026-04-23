from fastapi import APIRouter, Depends, Request
from fastapi.openapi.docs import get_swagger_ui_html

from app.auth import require_current_user
from app.models import User
from app.schemas import SchedulerStatusRead
from app.scheduler import get_scheduler_status

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/openapi.json", include_in_schema=False)
def api_openapi(request: Request, _: User = Depends(require_current_user)) -> dict[str, object]:
    return request.app.openapi()


@router.get("/docs", include_in_schema=False)
def api_docs(request: Request, _: User = Depends(require_current_user)):
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title=f"{request.app.title} - Swagger UI")


@router.get("/scheduler/status", response_model=SchedulerStatusRead)
def api_scheduler_status(_: User = Depends(require_current_user)) -> SchedulerStatusRead:
    return SchedulerStatusRead(**get_scheduler_status())
