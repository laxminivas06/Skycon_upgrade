"""
SKYCON System — Production WSGI Entry Point (PythonAnywhere & Production Servers)

For PythonAnywhere configuration:
1. In the Web tab, select 'Manual configuration' (Flask / Python 3.10+).
2. Point your WSGI configuration file to import 'application' from this file:
   from wsgi import application
"""

import os
import sys

# Add project root directory to Python path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.main import app as application

# For direct execution: python wsgi.py
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8443))
    application.run(host="0.0.0.0", port=port, debug=False)
