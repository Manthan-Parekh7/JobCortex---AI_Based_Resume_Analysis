import logging

from fastapi import Header, HTTPException, status

from backend.core.config import INTERNAL_SERVICE_HEADER, INTERNAL_SERVICE_KEY

logger = logging.getLogger('ats_resume_scorer')


def require_internal_service_key(
    internal_key: str | None = Header(None, alias=INTERNAL_SERVICE_HEADER),
) -> None:
    if not INTERNAL_SERVICE_KEY:
        logger.error('INTERNAL_SERVICE_KEY is not configured on the service')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Internal auth not configured on the service',
        )

    if not internal_key or internal_key != INTERNAL_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or missing internal service key',
        )
