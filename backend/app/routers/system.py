from fastapi import APIRouter, Depends, Request, Response
from fastapi.openapi.docs import get_swagger_ui_html

from app.auth import require_current_user
from app.models import User
from app.release_status import BUILD_REVISION, BUILD_VERSION, REPOSITORY_URL, ReleaseStatus
from app.schemas_scheduler import SchedulerStatusRead
from app.scheduler import get_scheduler_status

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/release-status", response_model=ReleaseStatus)
async def api_release_status(
    request: Request, response: Response, user: User = Depends(require_current_user),
) -> ReleaseStatus:
    response.headers["Cache-Control"] = "no-store"
    update = None
    if user.role == "admin" and BUILD_VERSION != "dev":
        update = await request.app.state.release_checker.available_update()
    return ReleaseStatus(version=BUILD_VERSION, revision=BUILD_REVISION, repository_url=REPOSITORY_URL, update=update)


@router.get("/openapi.json", include_in_schema=False)
def api_openapi(request: Request, _: User = Depends(require_current_user)) -> dict[str, object]:
    return request.app.openapi()


@router.get("/docs", include_in_schema=False)
def api_docs(request: Request, _: User = Depends(require_current_user)):
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title=f"{request.app.title} - Swagger UI")


@router.get("/scheduler/status", response_model=SchedulerStatusRead)
def api_scheduler_status(_: User = Depends(require_current_user)) -> SchedulerStatusRead:
    return SchedulerStatusRead(**get_scheduler_status())
