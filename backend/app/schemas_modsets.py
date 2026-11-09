from datetime import datetime
from typing import Annotated, Literal

from pydantic import AliasChoices, BaseModel, Field, computed_field, field_validator, model_validator
from app.schemas_groups import GroupPermission


class ParentModsetInput(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def reject_conflicting_aliases(cls, data):
        if isinstance(data, dict):
            for current, legacy in (("parent_modset_id", "base_modset_id"), ("confirm_parent_conflicts", "confirm_base_conflicts"), ("order_mode", "export_order_mode")):
                if current in data and legacy in data:
                    left, right = data[current], data[legacy]
                    if current == "order_mode":
                        left = "parent" if left == "base" else left
                        right = "parent" if right == "base" else right
                    if left != right:
                        raise ValueError(f"Conflicting {current} and compatibility alias {legacy}")
        return data

    @field_validator("export_order_mode", mode="before", check_fields=False)
    @classmethod
    def accept_parent_mode(cls, value):
        # Keep the persisted mode value so existing databases and clients remain valid.
        return "base" if value == "parent" else value


class ModSetCreate(ParentModsetInput):
    export_order_mode: Literal["independent", "base"] = Field(default="base", validation_alias=AliasChoices("order_mode", "export_order_mode"), json_schema_extra={"enum": ["parent", "independent"], "default": "parent"})
    base_modset_id: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("parent_modset_id", "base_modset_id"))
    name: str = Field(min_length=1, max_length=120)
    shared: Literal[False] = Field(default=False, json_schema_extra={'deprecated': True}, description="Global sharing was removed. Only false is accepted; use group permissions.")


class ModSetUpdate(ParentModsetInput):
    export_order_mode: Literal["independent", "base"] | None = Field(default=None, validation_alias=AliasChoices("order_mode", "export_order_mode"), json_schema_extra={"enum": ["parent", "independent", None]})
    confirm_order_change: bool = False
    base_modset_id: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("parent_modset_id", "base_modset_id"))
    confirm_base_conflicts: bool = Field(default=False, validation_alias=AliasChoices("confirm_parent_conflicts", "confirm_base_conflicts"))
    name: str = Field(min_length=1, max_length=120)
    shared: Literal[False] | None = Field(default=None, json_schema_extra={'deprecated': True}, description="Global sharing was removed. Use group permissions.")
    group_permissions: list[GroupPermission] | None = None


class ModSetExportOrderUpdate(BaseModel):
    mod_ids: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(min_length=1, max_length=100000)


class ModSetLoadOrderEntry(BaseModel):
    mod_id: str = Field(min_length=1, max_length=80)
    load_order: int = Field(ge=0, le=999999)


class ModSetLoadOrderUpdate(BaseModel):
    entries: list[ModSetLoadOrderEntry] = Field(min_length=1)


class ModSetRead(BaseModel):
    export_order_mode: Literal["independent", "base"] = Field(default="independent", json_schema_extra={"deprecated": True, "description": "Compatibility field; use order_mode."})
    base_modset_id: int | None = Field(default=None, json_schema_extra={"deprecated": True, "description": "Compatibility field; use parent_modset_id."})
    base_modset_name: str | None = Field(default=None, json_schema_extra={"deprecated": True, "description": "Compatibility field; use parent_modset_name."})
    derived_modsets_count: int = Field(default=0, json_schema_extra={"deprecated": True, "description": "Compatibility field; use child_modsets_count."})
    id: int
    name: str
    tracked_mods_count: int
    shared: Literal[False] = Field(default=False, json_schema_extra={'deprecated': True}, description="Compatibility field; always false. Access is controlled by ownership and groups.")
    owner_username: str | None = None
    is_owner: bool = False
    can_edit: bool = False
    can_delete: bool = False
    can_manage_access: bool = False
    has_group_access: bool = False
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def parent_modset_id(self) -> int | None:
        return self.base_modset_id

    @computed_field
    @property
    def parent_modset_name(self) -> str | None:
        return self.base_modset_name

    @computed_field
    @property
    def child_modsets_count(self) -> int:
        return self.derived_modsets_count

    @computed_field
    @property
    def order_mode(self) -> Literal["parent", "independent"]:
        return "parent" if self.export_order_mode == "base" else "independent"

    model_config = {"from_attributes": True}


class ModSetExportEntry(BaseModel):
    modId: str
    name: str
    version: str
