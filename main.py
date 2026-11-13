import re
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Quadra Office API", version="0.1.0")

# Home page (opened from a local static server or Electron) calls this API from the browser,
# so CORS must be allowed. Tighten allow_origins later when you deploy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

AppId = Literal["word", "excel", "powerpoint", "onenote"]
CELL_REF = re.compile(r"^[A-Z]{1,3}[1-9][0-9]{0,6}$")

# ---------------- Schemas ----------------
# Later these will move to backend/schemas.py

class UIComponent(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    type: Literal["button", "input", "menu", "panel", "toolbar"]
    label: str = Field(min_length=1, max_length=100)
    enabled: bool = True


class AppUI(BaseModel):
    app_id: AppId
    title: str
    theme: Literal["light", "dark"] = "light"
    toolbar: list[str] = []
    components: list[UIComponent] = []


class CellUpdate(BaseModel):
    cell: str = Field(description="Cell reference such as A1 or C12")
    value: int | float | str | None = None

    @field_validator("cell")
    @classmethod
    def check_cell(cls, v: str) -> str:
        v = v.strip().upper()
        if not CELL_REF.match(v):
            raise ValueError("cell must look like A1 or C12")
        return v


class CellUpdateRequest(BaseModel):
    sheet: str = Field(default="Sheet1", min_length=1, max_length=50)
    updates: list[CellUpdate] = Field(min_length=1, max_length=500)


class CellUpdateResponse(BaseModel):
    ok: bool
    sheet: str
    saved: int


# ---------------- UI definitions ----------------

APP_TITLES = {
    "word": "Quadra Word",
    "excel": "Quadra Excel",
    "powerpoint": "Quadra PowerPoint",
    "onenote": "Quadra OneNote",
}

TOOLBARS = {
    "word": ["Home", "Insert", "Design", "Layout", "References", "Review", "View"],
    "excel": ["Home", "Insert", "Formulas", "Data", "Review", "View"],
    "powerpoint": ["Home", "Insert", "Design", "Transitions", "Animations", "Slide Show"],
    "onenote": ["Home", "Insert", "Draw", "History", "Review", "View"],
}


def build_ui(app_id: AppId, theme: str) -> AppUI:
    return AppUI(
        app_id=app_id,
        title=APP_TITLES[app_id],
        theme=theme,
        toolbar=TOOLBARS[app_id],
        components=[
            UIComponent(id="main-canvas", type="panel", label="Main canvas"),
            UIComponent(id="save", type="button", label="Save"),
        ],
    )


# ---------------- Routes ----------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Excel has its own UI route and cell update route
@app.get("/api/excel", response_model=AppUI)
def excel_ui(theme: Literal["light", "dark"] = "light") -> AppUI:
    return build_ui("excel", theme)


@app.post("/api/excel/cells", response_model=CellUpdateResponse)
def excel_update_cells(payload: CellUpdateRequest) -> CellUpdateResponse:
    # Storage will be added in backend/ later. For now the validated payload is acknowledged.
    return CellUpdateResponse(ok=True, sheet=payload.sheet, saved=len(payload.updates))


# Word, PowerPoint and OneNote share one UI route
@app.get("/api/{app_id}", response_model=AppUI)
def shared_ui(
    app_id: Literal["word", "powerpoint", "onenote"],
    theme: Literal["light", "dark"] = "light",
) -> AppUI:
    return build_ui(app_id, theme)