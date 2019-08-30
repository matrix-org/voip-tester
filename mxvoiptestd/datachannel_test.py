import asyncio

from aiortc import RTCSessionDescription, RTCPeerConnection, RTCDataChannel

MAGIC_QUESTION = "Hello? Is this on?"
MAGIC_ANSWER = "Yes; yes, it is! :^)"

TIMEOUT_TIME = 300


async def setup_test(connection: RTCPeerConnection, offer) -> RTCSessionDescription:
    desc = RTCSessionDescription(offer["sdp"], offer["type"])
    await connection.setRemoteDescription(desc)
    await connection.setLocalDescription(await connection.createAnswer())

    @connection.on("datachannel")
    def on_datachannel(channel: RTCDataChannel):
        # TODO debug()
        @channel.on("message")
        def on_message(message):
            # TODO debug()
            if message == MAGIC_QUESTION:
                channel.send(MAGIC_ANSWER)
            else:
                channel.close()
                asyncio.ensure_future(connection.close())

    # Make the connection time out
    asyncio.get_event_loop().call_later(
        TIMEOUT_TIME, asyncio.ensure_future, connection.close()
    )

    # this is the answer to return
    return connection.localDescription
