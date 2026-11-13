import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from schema.payload import (
    APP_TITLES,
    TOOLBARS,
    AppUI,
    CellUpdateRequest,
    CellUpdateResponse,
    ThemeName,
    UIComponent,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Quadra Office", version="0.2.0")


# ---------------- Middleware ----------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response


# ---------------- Helpers ----------------

def build_ui(app_id: str, theme: ThemeName) -> AppUI:
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


# ---------------- API routes (must come before the static mount) ----------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/excel", response_model=AppUI)
def excel_ui(theme: ThemeName = "light") -> AppUI:
    return build_ui("excel", theme)


@app.post("/api/excel/cells", response_model=CellUpdateResponse)
def excel_update_cells(payload: CellUpdateRequest) -> CellUpdateResponse:
    return CellUpdateResponse(ok=True, sheet=payload.sheet, saved=len(payload.updates))


@app.get("/api/{app_id}", response_model=AppUI)
def shared_ui(
    app_id: Literal["word", "powerpoint", "onenote"],
    theme: ThemeName = "light",
) -> AppUI:
    return build_ui(app_id, theme)


# ---------------- Static UI (must stay LAST) ----------------

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")