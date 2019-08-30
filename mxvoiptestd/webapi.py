from aiortc import (
    RTCPeerConnection,
    RTCConfiguration,
    sdp,
)
from quart import Quart, request, jsonify

from mxvoiptestd import datachannel_test, sdp_doctor

app = Quart(__name__)


@app.before_first_request
async def startup():
    print("hello world!")


@app.route("/")
def root():
    return app.send_static_file("tester.html")


@app.route("/health")
def health():
    return "I'm all right! :^)"


@app.route("/v1/test_me", methods=["POST"])
async def test_me():
    inboundArgs = await request.json

    if inboundArgs is None:
        return "Must send request JSON", 400

    if "offer" not in inboundArgs or "candidate" not in inboundArgs:
        return "Missing offer or candidate in request JSON", 400

    connection = RTCPeerConnection(
        RTCConfiguration(iceServers=[])
    )  # TODO stun turn.librepush.net
    offer = inboundArgs["offer"]

    wanted_candidate_sdp = inboundArgs["candidate"]
    if wanted_candidate_sdp.startswith("candidate:"):
        wanted_candidate_sdp = wanted_candidate_sdp[len("candidate:"):]

    wanted_candidate = sdp.candidate_from_sdp(wanted_candidate_sdp)

    doctored_sdp = sdp_doctor.doctor_sdp(offer["sdp"], wanted_candidate)

    print("orig SDP", offer["sdp"])
    print("doctored SDP", doctored_sdp)

    doctored_offer = {"sdp": doctored_sdp, "type": offer["type"]}

    answer = await datachannel_test.setup_test(connection, doctored_offer)

    return jsonify({"answer": {"sdp": answer.sdp, "type": answer.type}})


@app.route("/v1/test_me", methods=["OPTIONS"])
async def test_me_options():
    # TODO CORS headers
    pass


# @app.websocket('/ws')
# async def ws():
#     while True:
#         await websocket.send('hello')
