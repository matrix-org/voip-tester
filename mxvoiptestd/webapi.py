import logging
import os

import toml
from aiortc import (
    RTCPeerConnection,
    RTCConfiguration,
    sdp, RTCIceServer,
)
from quart import Quart, request, jsonify

from mxvoiptestd import datachannel_test

# FIXME don't know how to do this properly/nicely.
logging.basicConfig(level=logging.INFO)

app = Quart(__name__)
logger = app.logger
# XXX without this I get double logging… don't have time to look into it now, sorry :|
logger.propagate = False


def load_config():
    # set defaults
    # urgh: vars have to be uppercase. I won't object if anyone sorts this out
    # one day.
    app.config.from_mapping({
        'TURN': None,
    })

    # set from file if present. Again: they have to be uppercase in this file.
    config_path = os.getenv("VOIPTEST_CONFIG", None)
    if config_path:
        logger.info("Found VOIPTEST_CONFIG env var; loading %s", config_path)
        app.config.from_file(config_path, toml.load)
    else:
        logger.info("No VOIPTEST_CONFIG env var — not configuring")

    logger.info("TURN server %s", "configured" if app.config['TURN'] else "not configured")


load_config()


@app.before_first_request
async def startup():
    # use the hypercorn logger if it is set; FIXME make this runner-neutral
    # unfortunately we can't use it until startup... :/.
    # perhaps switch to --log-config in hypercorn...
    hypercorn_logger = logging.getLogger('hypercorn.error')
    if hypercorn_logger.hasHandlers():
        # we are running under hypercorn
        assert not hypercorn_logger.propagate, "hypercorn shouldn't propagate."
        logging.root.handlers = hypercorn_logger.handlers
        logging.root.setLevel(hypercorn_logger.level)


@app.route("/")
async def root():
    return await app.send_static_file("tester.html")


@app.route("/health")
def health():
    return "I'm all right! :^)"


@app.route("/v1/test_me", methods=["POST"])
async def test_me():
    inbound_args = await request.json

    if inbound_args is None:
        return "Must send request JSON", 400

    if "offer" not in inbound_args:
        return "Missing offer in request JSON", 400

    ice_servers = []

    turn_config = app.config['TURN']
    if turn_config:
        ice_servers.append(RTCIceServer(
            turn_config['uri'],
            turn_config['username'],
            turn_config['password'],
        ))

    connection = RTCPeerConnection(
        RTCConfiguration(iceServers=ice_servers)
    )
    offer = inbound_args["offer"]

    # wanted_candidate_sdp = inbound_args["candidate"]
    # if wanted_candidate_sdp.startswith("candidate:"):
    #     wanted_candidate_sdp = wanted_candidate_sdp[len("candidate:"):]
    #
    # wanted_candidate = sdp.candidate_from_sdp(wanted_candidate_sdp)
    #
    # doctored_sdp = sdp_doctor.doctor_sdp(offer["sdp"], wanted_candidate)
    #
    # print("orig SDP", offer["sdp"])
    # print("doctored SDP", doctored_sdp)

    offer = {"sdp": offer["sdp"], "type": offer["type"]}

    sdp.parameters_from_sdp(offer["sdp"])

    answer = await datachannel_test.setup_test(connection, offer)

    return jsonify({"answer": {"sdp": answer.sdp, "type": answer.type}})

    # doctored_sdp = sdp_doctor.remove_all_candidates(answer.sdp)
    # return jsonify({"answer": {"sdp": doctored_sdp, "type": answer.type}})

    # doctored_sdp = sdp_doctor.doctor_sdp(answer.sdp, RTCIceCandidate(1, "42432452", "20.10.10.10", 4242, 1, "udp", "host"))
    # return jsonify({"answer": {"sdp": doctored_sdp, "type": answer.type}})


@app.route("/v1/test_me", methods=["OPTIONS"])
async def test_me_options():
    # TODO CORS headers?
    pass


# @app.websocket('/ws')
# async def ws():
#     while True:
#         await websocket.send('hello')
