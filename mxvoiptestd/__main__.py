import logging

from mxvoiptestd import webapi

if __name__ == "__main__":
    # intended for development. In production, use an ASGI runner.
    logging.basicConfig(level=logging.DEBUG, force=True)
    logging.warning("Running in debug mode. Do not use in production.")
    webapi.app.run(debug=True)
