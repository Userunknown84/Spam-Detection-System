import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

PREDICT_RATE_LIMIT = os.getenv("PREDICT_RATE_LIMIT", "50 per minute")
limiter = Limiter(key_func=get_remote_address, default_limits=[PREDICT_RATE_LIMIT])
