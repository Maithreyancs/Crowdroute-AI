"""Vercel entrypoint for CrowdRoute AI FastAPI backend.

Exposes the existing FastAPI application as a module-level variable named `app`
for the Vercel Python runtime when running with service root `backend` and
entrypoint `main:app`.
"""

from app.main import app

# Explicit top-level assignment for Vercel static AST analysis
app = app

__all__ = ["app"]
