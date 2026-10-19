"""Persistent SQLite-backed Citizen Grievance & Complaint Repository for CrowdRoute AI.
Handles storage, retrieval, reference ID generation, and privacy-preserving public listing.
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.models import (
    ComplaintCreate,
    ComplaintPublicItem,
    ComplaintResponse,
)

import os
import shutil

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "complaints.db"
_env_db_path = os.environ.get("COMPLAINTS_DB_PATH")

if _env_db_path:
    DB_PATH = Path(_env_db_path)
elif os.environ.get("VERCEL"):
    # On Vercel Fluid compute / Lambda, /tmp is writable
    _tmp_db = Path("/tmp/complaints.db")
    if not _tmp_db.exists() and DEFAULT_DB_PATH.exists():
        try:
            shutil.copy2(str(DEFAULT_DB_PATH), str(_tmp_db))
        except Exception:
            pass
    DB_PATH = _tmp_db
else:
    DB_PATH = DEFAULT_DB_PATH


def get_db_connection() -> sqlite3.Connection:
    """Returns an open sqlite3 connection with dict-like row factory."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Ensures complaints table exists with necessary indexes."""
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS complaints (
                reference_id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                stop_id TEXT NOT NULL,
                description TEXT NOT NULL,
                incident_time TEXT,
                contact_phone TEXT,
                contact_email TEXT,
                status TEXT NOT NULL DEFAULT 'Received',
                created_at TEXT NOT NULL,
                resolution_notes TEXT
            )
            """
        )
        conn.commit()


# Initialize table on import
init_db()


def generate_reference_id() -> str:
    """Generates a citizen-friendly reference code, e.g., CR-2026-F982A."""
    unique_suffix = uuid.uuid4().hex[:5].upper()
    return f"CR-2026-{unique_suffix}"


def save_complaint(data: ComplaintCreate) -> ComplaintResponse:
    """Inserts a new complaint into the database and returns complete response."""
    ref_id = generate_reference_id()
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO complaints (
                reference_id, category, stop_id, description,
                incident_time, contact_phone, contact_email,
                status, created_at, resolution_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Received', ?, NULL)
            """,
            (
                ref_id,
                data.category,
                data.stop_id.strip(),
                data.description.strip(),
                data.incident_time.strip() if data.incident_time else None,
                data.contact_phone.strip() if data.contact_phone else None,
                data.contact_email.strip() if data.contact_email else None,
                now_iso,
            ),
        )
        conn.commit()

    return ComplaintResponse(
        reference_id=ref_id,
        category=data.category,
        stop_id=data.stop_id.strip(),
        description=data.description.strip(),
        incident_time=data.incident_time.strip() if data.incident_time else None,
        status="Received",
        created_at=now_iso,
        resolution_notes=None,
    )


def list_public_complaints(limit: int = 50) -> List[ComplaintPublicItem]:
    """Retrieves complaints for public display.
    PRIVACY GUARANTEE: Never returns contact_phone or contact_email.
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT reference_id, category, stop_id, description,
                   incident_time, status, created_at
            FROM complaints
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()

    return [
        ComplaintPublicItem(
            reference_id=row["reference_id"],
            category=row["category"],
            stop_id=row["stop_id"],
            description=row["description"],
            incident_time=row["incident_time"],
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


def get_complaint(reference_id: str) -> Optional[ComplaintResponse]:
    """Retrieves full complaint record by unique reference ID."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            SELECT reference_id, category, stop_id, description,
                   incident_time, status, created_at, resolution_notes
            FROM complaints
            WHERE reference_id = ?
            """,
            (reference_id.strip(),),
        )
        row = cursor.fetchone()

    if not row:
        return None

    return ComplaintResponse(
        reference_id=row["reference_id"],
        category=row["category"],
        stop_id=row["stop_id"],
        description=row["description"],
        incident_time=row["incident_time"],
        status=row["status"],
        created_at=row["created_at"],
        resolution_notes=row["resolution_notes"],
    )
