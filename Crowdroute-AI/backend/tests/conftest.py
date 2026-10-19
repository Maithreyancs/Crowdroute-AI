"""Pytest configuration for CrowdRoute AI backend tests.
Ensures backend directory is on sys.path so 'app.*' imports resolve cleanly.
"""

import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
