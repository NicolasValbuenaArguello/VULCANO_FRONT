"""Standalone CRUD for fictitious Cartesian points. Run with one Uvicorn worker."""
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4
from typing import Literal

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class PointInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=100)
    category: Literal['punto', 'muestra', 'referencia'] = 'punto'
    x: float
    y: float
    description: str = Field(default="", max_length=1000)


class PointRecord(PointInput):
    id: str
    created_at: datetime


class StorageError(Exception):
    pass


class PointStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = Lock()

    def read(self) -> list[PointRecord]:
        try:
            if not self.path.exists():
                return []
            values = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(values, list):
                raise ValueError("Expected a JSON list")
            return [PointRecord.model_validate(value) for value in values]
        except (OSError, ValueError, ValidationError) as exc:
            raise StorageError from exc

    def write(self, records: list[PointRecord]) -> None:
        temporary = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent,
                                             prefix="points-", suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                json.dump([record.model_dump(mode="json") for record in records], stream,
                          ensure_ascii=False, indent=2, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        except (OSError, ValueError) as exc:
            raise StorageError from exc
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def create_app(data_file: Path | None = None) -> FastAPI:
    app = FastAPI(title="Local Points Demo", description="Fictitious local units only; no geographic data.")
    store = PointStore(data_file if data_file is not None else Path(__file__).parent / "data" / "points.json")
    app.state.store = store

    @app.exception_handler(StorageError)
    async def storage_error(_request, _error):
        return JSONResponse(status_code=500, content={"detail": "No se pudo acceder al archivo de puntos."})

    def require_unique_name(records: list[PointRecord], value: PointInput, excluded_id: str | None = None):
        if any(record.id != excluded_id and record.name.casefold() == value.name.casefold() for record in records):
            raise HTTPException(status_code=400, detail="Ya existe un punto con ese nombre.")

    @app.get("/api/demo-points", response_model=list[PointRecord])
    def list_points():
        with store.lock:
            return store.read()

    @app.get("/api/demo-points/{point_id}", response_model=PointRecord)
    def get_point(point_id: str):
        with store.lock:
            record = next((point for point in store.read() if point.id == point_id), None)
            if record is None:
                raise HTTPException(status_code=404, detail="Punto no encontrado.")
            return record

    @app.post("/api/demo-points", response_model=PointRecord, status_code=201)
    def create_point(value: PointInput):
        with store.lock:
            records = store.read()
            require_unique_name(records, value)
            record = PointRecord(**value.model_dump(), id=str(uuid4()), created_at=datetime.now(timezone.utc))
            store.write([*records, record])
            return record

    @app.put("/api/demo-points/{point_id}", response_model=PointRecord)
    def update_point(point_id: str, value: PointInput):
        with store.lock:
            records = store.read()
            existing = next((record for record in records if record.id == point_id), None)
            if existing is None:
                raise HTTPException(status_code=404, detail="Punto no encontrado.")
            require_unique_name(records, value, point_id)
            updated = PointRecord(**value.model_dump(), id=existing.id, created_at=existing.created_at)
            store.write([updated if record.id == point_id else record for record in records])
            return updated

    @app.delete("/api/demo-points/{point_id}", status_code=204)
    def delete_point(point_id: str):
        with store.lock:
            records = store.read()
            remaining = [record for record in records if record.id != point_id]
            if len(records) == len(remaining):
                raise HTTPException(status_code=404, detail="Punto no encontrado.")
            store.write(remaining)
            return Response(status_code=204)

    return app


app = create_app()
