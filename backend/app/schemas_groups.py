from typing import Literal

from pydantic import BaseModel, Field, field_validator


class GroupSummary(BaseModel):
    id: int
    name: str


class GroupWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    user_ids: list[int] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Group name is required")
        return value.strip()


class GroupRead(GroupSummary):
    description: str
    user_ids: list[int]


class GroupPermission(BaseModel):
    group_id: int
    permission: Literal["read", "write"]


class ModsetPermissionsUpdate(BaseModel):
    entries: list[GroupPermission]


class UserGroupsUpdate(BaseModel):
    group_ids: list[int]
