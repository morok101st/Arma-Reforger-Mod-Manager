from enum import StrEnum


class ModStatus(StrEnum):
    not_installed = "NOT_INSTALLED"
    unknown = "UNKNOWN"
    up_to_date = "UP_TO_DATE"
    update_available = "UPDATE_AVAILABLE"


class TrackingReason(StrEnum):
    manual = "manual"
    dependency = "dependency"


class UserRole(StrEnum):
    admin = "admin"
    user = "user"
