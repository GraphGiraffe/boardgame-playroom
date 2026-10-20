#!/usr/bin/env python3
# Compatibility shim; canonical implementation belongs to utils.
import runpy
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name("project_tools.py")))["load"]('package-pages.py','app',__name__))
