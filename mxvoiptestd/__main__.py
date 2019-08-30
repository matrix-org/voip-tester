from mxvoiptestd import webapi

if __name__ == "__main__":
    # intended for development. In production, use an ASGI runner.
    webapi.app.run()
