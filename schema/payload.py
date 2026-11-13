import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------- Base class ----------------
# सारी schemas इसी से inherit करती हैं।
# extra="forbid": payload में अनजान field आए तो 422 error मिलेगा।

class StrictBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------- Shared types and constants ----------------

AppId = Literal["word", "excel", "powerpoint", "onenote"]
ThemeName = Literal["light", "dark"]

CELL_REF = re.compile(r"^[A-Z]{1,3}[1-9][0-9]{0,6}$")

APP_TITLES: dict[str, str] = {
    "word": "Quadra Word",
    "excel": "Quadra Excel",
    "powerpoint": "Quadra PowerPoint",
    "onenote": "Quadra OneNote",
}

TOOLBARS: dict[str, list[str]] = {
    "word": ["Home", "Insert", "Design", "Layout", "References", "Review", "View"],
    "excel": ["Home", "Insert", "Formulas", "Data", "Review", "View"],
    "powerpoint": ["Home", "Insert", "Design", "Transitions", "Animations", "Slide Show"],
    "onenote": ["Home", "Insert", "Draw", "History", "Review", "View"],
}


# ---------------- UI schemas ----------------

class UIComponent(StrictBase):
    id: str = Field(min_length=1, max_length=64)
    type: Literal["button", "input", "menu", "panel", "toolbar"]
    label: str = Field(min_length=1, max_length=100)
    enabled: bool = True


class AppUI(StrictBase):
    app_id: AppId
    title: str
    theme: ThemeName = "light"
    toolbar: list[str] = []
    components: list[UIComponent] = []


# ---------------- Excel schemas ----------------

class CellUpdate(StrictBase):
    cell: str = Field(description="Cell reference such as A1 or C12")
    value: int | float | str | None = None

    @field_validator("cell")
    @classmethod
    def check_cell(cls, v: str) -> str:
        v = v.strip().upper()
        if not CELL_REF.match(v):
            raise ValueError("cell must look like A1 or C12")
        return v


class CellUpdateRequest(StrictBase):
    sheet: str = Field(default="Sheet1", min_length=1, max_length=50)
    updates: list[CellUpdate] = Field(min_length=1, max_length=500)


class CellUpdateResponse(StrictBase):
    ok: bool
    sheet: str
    saved: int