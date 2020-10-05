from setuptools import setup

setup(
    name="mxvoiptestd",
    version="0.1.0",
    packages=["mxvoiptestd"],
    url="https://github.com/matrix-org/voip-tester",
    license="Apache License 2.0",
    author="Olivier Wilkinson ('reivilibre')",
    author_email="oliverw@matrix.org",
    description="Tests VoIP functionality of a Matrix homeserver",
    install_requires=["aiortc>=0.9.21", "Quart>=0.9.1"],
)
